import { readFileSync } from "node:fs";
import type { Health, Subreddit } from "../shared/schema";
import { createClaudeAnalyzer, DEFAULT_MODEL } from "./analyze/claude";
import { createMockAnalyzer } from "./analyze/mock";
import type { Deps } from "./pipeline";
import { createAutocompleteClient, type AutocompleteMode } from "./sources/autocomplete";
import { createRedditClient, type RedditPost } from "./sources/reddit";
import { createFileStore } from "./store";

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8")) as T;

export function buildDeps(env: NodeJS.ProcessEnv): { deps: Deps; health: Health } {
  const mock = env.IDEA_CHECKER_MOCK === "1";
  const model = env.IDEA_CHECKER_MODEL || DEFAULT_MODEL;
  const store = createFileStore(env.IDEA_CHECKER_DATA_DIR || "data");
  const health: Health = {
    mock,
    keys: {
      anthropic: Boolean(env.ANTHROPIC_API_KEY),
      reddit: Boolean(env.REDDIT_CLIENT_ID && env.REDDIT_CLIENT_SECRET),
    },
    model: mock ? "mock" : model,
  };

  if (mock) {
    const posts = fixture<RedditPost[]>("mock-reddit-posts.json");
    const subreddits = fixture<Subreddit[]>("mock-subreddits.json");
    const phrases: Record<AutocompleteMode, string[]> = {
      gap: fixture("mock-autocomplete-gap.json"),
      niche: fixture("mock-autocomplete-niche.json"),
    };
    return {
      health,
      deps: {
        store,
        analyzer: createMockAnalyzer(),
        reddit: { searchPainPosts: async () => posts, searchSubreddits: async () => subreddits },
        autocomplete: { suggest: async (_seed, mode) => phrases[mode] },
      },
    };
  }

  return {
    health,
    deps: {
      store,
      analyzer: createClaudeAnalyzer({ model }),
      reddit: createRedditClient({
        clientId: env.REDDIT_CLIENT_ID,
        clientSecret: env.REDDIT_CLIENT_SECRET,
        userAgent: env.REDDIT_USER_AGENT,
      }),
      autocomplete: createAutocompleteClient(),
    },
  };
}
