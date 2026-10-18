import type { NicheRun, RunReport } from "../shared/schema";
import type { Store } from "./store";

/** Reddit content is kept for at most this many days, then removed from saved runs. */
export const REDDIT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const REDACTED_TEXT = `[Reddit content removed after ${REDDIT_RETENTION_DAYS} days]`;

export function isExpired(createdAt: string, now: Date, days = REDDIT_RETENTION_DAYS): boolean {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) && now.getTime() - created >= days * DAY_MS;
}

/**
 * Removes Reddit post text, links and subreddit names from a gap report. Ids and the
 * "reddit" source tag stay, so the gaps and their source counts still read correctly.
 * Reviews, autocomplete and Claude's gap summaries are kept.
 */
export function redactReport(report: RunReport, now: Date): RunReport {
  return {
    ...report,
    evidence: report.evidence.map((e) =>
      e.source === "reddit" ? { id: e.id, source: "reddit" as const, text: REDACTED_TEXT, redacted: true } : e,
    ),
    redditPurgedAt: now.toISOString(),
  };
}

/** Removes the subreddit list (names, member counts, descriptions) from a niche run. */
export function redactNicheRun(run: NicheRun, now: Date): NicheRun {
  return { ...run, subreddits: [], redditPurgedAt: now.toISOString() };
}

const hasRedditData = {
  report: (r: RunReport) => r.evidence.some((e) => e.source === "reddit" && !e.redacted),
  niche: (n: NicheRun) => n.subreddits.length > 0,
};

/** Rewrites every saved run older than the retention window that still holds Reddit content. Idempotent. */
export async function purgeExpiredRedditData(
  store: Store,
  now = new Date(),
  days = REDDIT_RETENTION_DAYS,
): Promise<{ runs: number; niches: number }> {
  let runs = 0;
  let niches = 0;
  for (const report of await store.listRuns(Infinity)) {
    if (isExpired(report.createdAt, now, days) && hasRedditData.report(report)) {
      await store.saveRun(redactReport(report, now));
      runs++;
    }
  }
  for (const run of await store.listNiches(Infinity)) {
    if (isExpired(run.createdAt, now, days) && hasRedditData.niche(run)) {
      await store.saveNiche(redactNicheRun(run, now));
      niches++;
    }
  }
  return { runs, niches };
}
