import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { buildDeps } from "./deps";
import { purgeExpiredRedditData, REDDIT_RETENTION_DAYS } from "./retention";

const port = Number(process.env.IDEA_CHECKER_PORT ?? 3001);
const { deps, health } = buildDeps(process.env);
const staticDir = fileURLToPath(new URL("../dist/web", import.meta.url));

const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;

async function purge() {
  try {
    const { runs, niches } = await purgeExpiredRedditData(deps.store);
    if (runs || niches) {
      console.log(`Removed Reddit content older than ${REDDIT_RETENTION_DAYS} days from ${runs} gap run(s), ${niches} niche run(s)`);
    }
  } catch (err) {
    console.error("Reddit retention purge failed:", err);
  }
}

// Reddit content in saved runs is removed once it is 30 days old: at startup and every 6 hours while running.
await purge();
setInterval(purge, PURGE_EVERY_MS).unref();

createApp(deps, health, { staticDir }).listen(port, () => {
  const mode = health.mock ? "MOCK mode (fixtures, no network)" : `live mode, model ${health.model}`;
  console.log(`Idea Checker API on http://localhost:${port} - ${mode}`);
  if (!health.mock && !health.keys.anthropic) console.log("  ! ANTHROPIC_API_KEY not set: Claude steps will fail");
  if (!health.mock && !health.keys.reddit) console.log("  ! Reddit keys not set: Reddit will be skipped");
});
