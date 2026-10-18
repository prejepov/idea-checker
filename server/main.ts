import "dotenv/config";
import { fileURLToPath } from "node:url";
import { createApp } from "./app";
import { buildDeps } from "./deps";

const port = Number(process.env.IDEA_CHECKER_PORT ?? 3001);
const { deps, health } = buildDeps(process.env);
const staticDir = fileURLToPath(new URL("../dist/web", import.meta.url));

createApp(deps, health, { staticDir }).listen(port, () => {
  const mode = health.mock ? "MOCK mode (fixtures, no network)" : `live mode, model ${health.model}`;
  console.log(`Idea Checker API on http://localhost:${port} - ${mode}`);
  if (!health.mock && !health.keys.anthropic) console.log("  ! ANTHROPIC_API_KEY not set: Claude steps will fail");
  if (!health.mock && !health.keys.reddit) console.log("  ! Reddit keys not set: Reddit will be skipped");
});
