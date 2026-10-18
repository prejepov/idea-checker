import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { AnalysisError, createClaudeAnalyzer, DEFAULT_MODEL } from "../../server/analyze/claude";
import { createMockAnalyzer, MOCK_INVENTED_ID } from "../../server/analyze/mock";

function fakeClient(response: Record<string, unknown>) {
  const calls: Array<Record<string, unknown>> = [];
  const client = {
    beta: {
      messages: {
        parse: async (params: Record<string, unknown>) => {
          calls.push(params);
          return {
            model: DEFAULT_MODEL,
            usage: { input_tokens: 1200, output_tokens: 300 },
            stop_reason: "end_turn",
            parsed_output: { gaps: [] },
            ...response,
          };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

describe("createClaudeAnalyzer", () => {
  it("sends the planned model, effort, fallbacks and a structured output format", async () => {
    const { client, calls } = fakeClient({});
    const out = await createClaudeAnalyzer({ client }).findGaps("budget spreadsheet", [
      { id: "r1", source: "reddit", text: "hi" },
    ]);
    const params = calls[0]!;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect((params.output_config as { effort: string }).effort).toBe("medium");
    expect((params.output_config as { format: { type: string } }).format.type).toBe("json_schema");
    expect(JSON.stringify(params.messages)).toContain('<item id=\\"r1\\" source=\\"reddit\\">hi</item>');
    expect(out.usage).toEqual({ model: DEFAULT_MODEL, input_tokens: 1200, output_tokens: 300 });
  });

  it.each([
    ["refusal", "declined"],
    ["max_tokens", "cut off"],
  ])("turns stop_reason %s into a readable error", async (stop_reason, message) => {
    const { client } = fakeClient({ stop_reason });
    const promise = createClaudeAnalyzer({ client }).findNiches("spreadsheet", [], []);
    await expect(promise).rejects.toBeInstanceOf(AnalysisError);
    await expect(createClaudeAnalyzer({ client }).findNiches("x", [], [])).rejects.toThrow(message);
  });

  it("errors when the output doesn't parse", async () => {
    const { client } = fakeClient({ parsed_output: null });
    await expect(createClaudeAnalyzer({ client }).findGaps("x", [])).rejects.toThrow("expected format");
  });
});

describe("createMockAnalyzer", () => {
  it("groups evidence by keyword and always cites one invented id on the first theme", async () => {
    const { result } = await createMockAnalyzer().findGaps("budget spreadsheet", [
      { id: "r1", source: "reddit", text: "I wish there was a sheet for irregular income" },
      { id: "v1", source: "review", text: "My husband and I can't share it" },
    ]);
    expect(result.gaps.map((g) => g.title)).toEqual([
      "No way to budget an irregular income",
      "Couples can't share one budget",
    ]);
    expect(result.gaps[0]!.evidence_ids).toEqual(["r1", MOCK_INVENTED_ID]);
  });
});
