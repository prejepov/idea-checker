import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { RunReport } from "../../shared/schema";
import { buildDeps } from "../../server/deps";
import { runCheck, runNicheFinder, type Deps } from "../../server/pipeline";
import { isExpired, purgeExpiredRedditData, REDACTED_TEXT } from "../../server/retention";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-20T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);
const sampleReviews = readFileSync(new URL("../../fixtures/sample-reviews.txt", import.meta.url), "utf8");

let deps: Deps;
let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "idea-retention-"));
  deps = buildDeps({ IDEA_CHECKER_MOCK: "1", IDEA_CHECKER_DATA_DIR: dataDir }).deps;
});

const checkAt = (when: Date) =>
  runCheck(
    { ...deps, now: () => when },
    {
      niche: "budget spreadsheet",
      reviewsText: sampleReviews,
      redditText: "Pasted thread about irregular income",
      etsy: { topMonthlyRevenue: 8100, price: 18.86, badgeSeen: true },
      minMonthlyRevenue: 1000,
    },
  );

const nicheAt = (when: Date) =>
  runNicheFinder({ ...deps, now: () => when }, { category: "spreadsheet", minMonthlyRevenue: 500 });

describe("isExpired", () => {
  it("expires at exactly 30 days, not before", () => {
    expect(isExpired(daysAgo(30).toISOString(), now)).toBe(true);
    expect(isExpired(new Date(daysAgo(30).getTime() + 60_000).toISOString(), now)).toBe(false);
    expect(isExpired(daysAgo(1).toISOString(), now)).toBe(false);
  });
  it("never expires an unparseable date", () => {
    expect(isExpired("not a date", now)).toBe(false);
  });
});

describe("purgeExpiredRedditData", () => {
  it("removes Reddit text and links from old gap runs and keeps everything else", async () => {
    const old = await checkAt(daysAgo(31));
    const recent = await checkAt(daysAgo(2));
    expect(old.evidence.filter((e) => e.source === "reddit").length).toBeGreaterThan(1); // API + pasted

    expect(await purgeExpiredRedditData(deps.store, now)).toEqual({ runs: 1, niches: 0 });

    const purged = (await deps.store.getRun(old.id))!;
    expect(purged.redditPurgedAt).toBe(now.toISOString());
    for (const e of purged.evidence.filter((e) => e.source === "reddit")) {
      expect(e).toEqual({ id: e.id, source: "reddit", text: REDACTED_TEXT, redacted: true });
    }
    // Reviews, autocomplete, ids, gaps and source counts are untouched.
    const nonReddit = (r: RunReport) => r.evidence.filter((e) => e.source !== "reddit");
    expect(nonReddit(purged)).toEqual(nonReddit(old));
    expect(purged.evidence.map((e) => e.id)).toEqual(old.evidence.map((e) => e.id));
    expect(purged.gaps).toEqual(old.gaps);

    expect(await deps.store.getRun(recent.id)).toEqual(recent);
  });

  it("removes the subreddit list from old niche runs only", async () => {
    const old = await nicheAt(daysAgo(45));
    const recent = await nicheAt(daysAgo(3));
    expect(old.subreddits.length).toBeGreaterThan(0);

    expect(await purgeExpiredRedditData(deps.store, now)).toEqual({ runs: 0, niches: 1 });

    const purged = (await deps.store.getNiche(old.id))!;
    expect(purged.subreddits).toEqual([]);
    expect(purged.redditPurgedAt).toBe(now.toISOString());
    expect(purged.candidates).toEqual(old.candidates);
    expect(purged.phrases).toEqual(old.phrases);
    expect(await deps.store.getNiche(recent.id)).toEqual(recent);
  });

  it("is idempotent: a second pass changes nothing", async () => {
    const old = await checkAt(daysAgo(40));
    await purgeExpiredRedditData(deps.store, now);
    const file = join(dataDir, "runs", `${old.id}.json`);
    const before = readFileSync(file, "utf8");

    expect(await purgeExpiredRedditData(deps.store, new Date(now.getTime() + DAY))).toEqual({ runs: 0, niches: 0 });
    expect(readFileSync(file, "utf8")).toBe(before);
  });

  it("covers every saved run, not just the 50 the History list shows", async () => {
    const template = await checkAt(daysAgo(60));
    for (let i = 0; i < 55; i++) {
      await deps.store.saveRun({ ...template, id: `${template.id}-${String(i).padStart(2, "0")}` });
    }
    const result = await purgeExpiredRedditData(deps.store, now);
    expect(result.runs).toBe(56);
    const all = await deps.store.listRuns(Infinity);
    expect(all.every((r) => r.evidence.every((e) => e.source !== "reddit" || e.redacted))).toBe(true);
  });
});
