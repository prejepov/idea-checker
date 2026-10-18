// Removes Reddit content older than 30 days from saved runs: npm run purge:reddit
import "dotenv/config";
import { purgeExpiredRedditData, REDDIT_RETENTION_DAYS } from "../server/retention";
import { createFileStore } from "../server/store";

const store = createFileStore(process.env.IDEA_CHECKER_DATA_DIR || "data");
const { runs, niches } = await purgeExpiredRedditData(store);
console.log(
  `Removed Reddit content older than ${REDDIT_RETENTION_DAYS} days from ${runs} gap run(s) and ${niches} niche run(s).`,
);
