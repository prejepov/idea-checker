// Live smoke test for the real sources (network, no Claude): npm run smoke:sources -- "budget spreadsheet"
import "dotenv/config";
import { createAutocompleteClient } from "../server/sources/autocomplete";
import { createRedditClient } from "../server/sources/reddit";
import { SourceSkipped } from "../server/sources/errors";

const seed = process.argv[2] ?? "budget spreadsheet";

async function section(name: string, fn: () => Promise<string[]>) {
  try {
    const lines = await fn();
    console.log(`\n== ${name}: ${lines.length} ==`);
    for (const line of lines.slice(0, 10)) console.log(`  ${line}`);
  } catch (err) {
    const kind = err instanceof SourceSkipped ? "SKIPPED" : "ERROR";
    console.log(`\n== ${name}: ${kind} ==\n  ${(err as Error).message}`);
  }
}

const reddit = createRedditClient({
  clientId: process.env.REDDIT_CLIENT_ID,
  clientSecret: process.env.REDDIT_CLIENT_SECRET,
  userAgent: process.env.REDDIT_USER_AGENT,
});
const autocomplete = createAutocompleteClient();

await section("Autocomplete (gap)", () => autocomplete.suggest(seed, "gap"));
await section("Reddit pain posts", async () =>
  (await reddit.searchPainPosts(seed)).map((p) => `${p.subreddit} | ${p.title.slice(0, 90)}`),
);
await section("Reddit subreddits", async () =>
  (await reddit.searchSubreddits(seed)).map((s) => `${s.name} (${s.subscribers})`),
);
