import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import {
  ClaudeGapResult,
  ClaudeNicheResult,
  type EvidenceItem,
  type Subreddit,
  type Usage,
} from "../../shared/schema";
import { GAP_SYSTEM, NICHE_SYSTEM, renderGapPrompt, renderNichePrompt } from "./prompt";

export const DEFAULT_MODEL = "claude-opus-5-5";

/** A Claude failure worth showing to the user as-is. */
export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisError";
  }
}

export interface Analyzer {
  findGaps(niche: string, evidence: EvidenceItem[]): Promise<{ result: ClaudeGapResult; usage: Usage }>;
  findNiches(
    category: string,
    phrases: string[],
    subreddits: Subreddit[],
  ): Promise<{ result: ClaudeNicheResult; usage: Usage }>;
}

async function callApi<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AnalysisError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AnalysisError("Claude is rate-limited right now. Wait a minute and try again.");
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AnalysisError("Couldn't reach the Claude API. Check your internet connection.");
    }
    if (err instanceof Anthropic.APIError) {
      throw new AnalysisError(`Claude API error ${err.status ?? ""}: ${err.message}`.trim());
    }
    throw err;
  }
}

export function createClaudeAnalyzer(opts: { client?: Anthropic; model?: string } = {}): Analyzer {
  const model = opts.model ?? DEFAULT_MODEL;
  let client = opts.client ?? null;

  function getClient(): Anthropic {
    if (client) return client;
    try {
      client = new Anthropic();
    } catch (err) {
      throw new AnalysisError(`Claude isn't configured: ${(err as Error).message}`);
    }
    return client;
  }

  async function run<T extends z.ZodType>(schema: T, system: string, user: string) {
    const res = await callApi(() =>
      getClient().beta.messages.parse({
        model,
        max_tokens: 16000,
        // On a policy decline, the API re-runs on its default fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        system,
        messages: [{ role: "user", content: user }],
      }),
    );
    if (res.stop_reason === "refusal") {
      throw new AnalysisError("Claude declined this request. Try rephrasing the niche or removing odd evidence.");
    }
    if (res.stop_reason === "max_tokens") {
      throw new AnalysisError("Claude's answer was cut off (max_tokens). Try less evidence.");
    }
    if (!res.parsed_output) {
      throw new AnalysisError("Claude's answer didn't match the expected format.");
    }
    const usage: Usage = {
      model: res.model,
      input_tokens: res.usage.input_tokens,
      output_tokens: res.usage.output_tokens,
    };
    return { result: res.parsed_output as z.infer<T>, usage };
  }

  return {
    findGaps: (niche, evidence) => run(ClaudeGapResult, GAP_SYSTEM, renderGapPrompt(niche, evidence)),
    findNiches: (category, phrases, subreddits) =>
      run(ClaudeNicheResult, NICHE_SYSTEM, renderNichePrompt(category, phrases, subreddits)),
  };
}
