import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NicheRun, RunReport } from "../../shared/schema";
import { AnalysisError, type Analyzer } from "../../server/analyze/claude";
import { MOCK_INVENTED_ID } from "../../server/analyze/mock";
import { createApp } from "../../server/app";
import { buildDeps } from "../../server/deps";
import type { Deps } from "../../server/pipeline";
import { SourceSkipped } from "../../server/sources/errors";

const sampleReviews = readFileSync(new URL("../../fixtures/sample-reviews.txt", import.meta.url), "utf8");

let dataDir: string;
let deps: Deps;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "idea-checker-"));
  const built = buildDeps({ IDEA_CHECKER_MOCK: "1", IDEA_CHECKER_DATA_DIR: dataDir });
  deps = built.deps;
  app = createApp(deps, built.health);
});

const videoEtsy = { topMonthlyRevenue: 13990, price: 19.76, badgeSeen: false };

describe("GET /api/health", () => {
  it("reports mock mode", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body).toMatchObject({ mock: true, model: "mock" });
  });
});

describe("POST /api/check (Stage 2)", () => {
  it("returns a saved report with a Validated gap backed by all three sources", async () => {
    const res = await request(app)
      .post("/api/check")
      .send({ niche: "budget spreadsheet", reviewsText: sampleReviews, etsy: videoEtsy });
    expect(res.status).toBe(200);
    const report = res.body as RunReport;

    expect(report.etsyGatePass).toBe(true);
    expect(report.sources.map((s) => [s.source, s.status])).toEqual([
      ["reddit", "ok"],
      ["reviews", "ok"],
      ["autocomplete", "ok"],
    ]);
    const top = report.gaps[0]!;
    expect(top.title).toBe("No way to budget an irregular income");
    expect(top.label).toBe("validated");
    expect(top.sources).toEqual(["reddit", "review", "autocomplete"]);
    // The mock cites an id that doesn't exist; the server must drop it.
    expect(top.droppedEvidenceIds).toEqual([MOCK_INVENTED_ID]);
    expect(top.validEvidenceIds.every((id) => report.evidence.some((e) => e.id === id))).toBe(true);
    // The Canva-copyable theme is flagged.
    expect(report.gaps.find((g) => g.title === "Hard to use on a phone")?.lowMoat).toBe(true);

    // Saved to disk and readable through the API.
    expect(readdirSync(join(dataDir, "runs"))).toEqual([`${report.id}.json`]);
    const again = await request(app).get(`/api/runs/${report.id}`);
    expect(again.body).toEqual(report);
    const list = await request(app).get("/api/runs");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].detail).toMatch(/validated/);
  });

  it("never validates without proven Etsy demand ($40/month top seller)", async () => {
    const res = await request(app)
      .post("/api/check")
      .send({ niche: "budget spreadsheet", reviewsText: sampleReviews, etsy: { topMonthlyRevenue: 40 } });
    const report = res.body as RunReport;
    expect(report.etsyGatePass).toBe(false);
    expect(report.gaps.some((g) => g.label === "validated")).toBe(false);
    expect(report.gaps[0]!.label).toBe("promising");
  });

  it("marks reviews as skipped when none are pasted", async () => {
    const res = await request(app).post("/api/check").send({ niche: "budget spreadsheet" });
    const report = res.body as RunReport;
    expect(report.sources.find((s) => s.source === "reviews")).toMatchObject({ status: "skipped" });
    expect(report.evidence.some((e) => e.source === "review")).toBe(false);
  });

  it("appends pasted Reddit threads after API posts", async () => {
    const res = await request(app)
      .post("/api/check")
      .send({ niche: "budget spreadsheet", redditText: "Pasted thread about irregular income" });
    const report = res.body as RunReport;
    const reddit = report.evidence.filter((e) => e.source === "reddit");
    expect(reddit.at(-1)).toMatchObject({ id: `r${reddit.length}`, text: "Pasted thread about irregular income" });
    expect(report.sources.map((s) => s.source)).toContain("reddit (pasted)");
  });

  it("rejects invalid requests with 400", async () => {
    const res = await request(app).post("/api/check").send({ niche: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid request");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await request(app).post("/api/check").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/runs/:id", () => {
  it("404s for unknown and path-traversal ids", async () => {
    expect((await request(app).get("/api/runs/nope")).status).toBe(404);
    expect((await request(app).get("/api/runs/..%2F..%2Fpackage")).status).toBe(404);
  });
});

describe("Niche Finder (Stage 1)", () => {
  it("creates candidates, applies the moat gate, and the revenue gate after PATCH", async () => {
    const created = await request(app).post("/api/niches").send({ category: "spreadsheet" });
    expect(created.status).toBe(200);
    const run = created.body as NicheRun;
    expect(run.minMonthlyRevenue).toBe(500);
    expect(run.candidates).toHaveLength(8);
    const gateOf = (r: NicheRun, name: string) => r.candidates.find((c) => c.name === name)!.gate;
    expect(gateOf(run, "Habit tracker printable")).toBe("fail-moat");
    expect(gateOf(run, "Debt payoff tracker")).toBe("pending");

    const irregular = run.candidates.find((c) => c.name === "Budget spreadsheet for irregular income")!;
    const couples = run.candidates.find((c) => c.name === "Couples budget spreadsheet")!;
    const patched = await request(app)
      .patch(`/api/niches/${run.id}`)
      .send({
        candidates: [
          { id: irregular.id, topMonthlyRevenue: 13990, badgeSeen: true },
          { id: couples.id, topMonthlyRevenue: 40, badgeSeen: false },
        ],
      });
    const updated = patched.body as NicheRun;
    expect(gateOf(updated, irregular.name)).toBe("pass");
    expect(gateOf(updated, couples.name)).toBe("fail-revenue");
    expect(updated.candidates[0]!.id).toBe(irregular.id); // passing ranks first

    const fromDisk = await request(app).get(`/api/niches/${run.id}`);
    expect(fromDisk.body).toEqual(updated);
    const list = await request(app).get("/api/niches");
    expect(list.body[0].detail).toBe("1 passing of 8 candidates");
  });

  it("raising the bar re-gates every candidate", async () => {
    const run = (await request(app).post("/api/niches").send({ category: "spreadsheet" })).body as NicheRun;
    const target = run.candidates.find((c) => c.gate === "pending")!;
    await request(app)
      .patch(`/api/niches/${run.id}`)
      .send({ candidates: [{ id: target.id, topMonthlyRevenue: 900, badgeSeen: false }] });
    const raised = (
      await request(app).patch(`/api/niches/${run.id}`).send({ minMonthlyRevenue: 1000, candidates: [] })
    ).body as NicheRun;
    expect(raised.candidates.find((c) => c.id === target.id)!.gate).toBe("fail-revenue");
  });

  it("404s when patching an unknown run", async () => {
    const res = await request(app).patch("/api/niches/nope").send({ candidates: [] });
    expect(res.status).toBe(404);
  });
});

describe("failure handling", () => {
  function appWith(overrides: Partial<Deps>) {
    return createApp({ ...deps, ...overrides }, { mock: true, keys: { anthropic: false, reddit: false }, model: "mock" });
  }

  it("keeps going when Reddit is skipped and autocomplete errors; no evidence means no Claude call", async () => {
    const findGaps = vi.fn<Analyzer["findGaps"]>();
    const res = await request(
      appWith({
        reddit: {
          searchPainPosts: async () => {
            throw new SourceSkipped("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set");
          },
          searchSubreddits: async () => [],
        },
        autocomplete: {
          suggest: async () => {
            throw new Error("Autocomplete failed for every query");
          },
        },
        analyzer: { ...deps.analyzer, findGaps },
      }),
    )
      .post("/api/check")
      .send({ niche: "budget spreadsheet" });
    expect(res.status).toBe(200);
    const report = res.body as RunReport;
    expect(report.sources).toEqual([
      { source: "reddit", status: "skipped", count: 0, message: "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set" },
      { source: "reviews", status: "skipped", count: 0, message: "No reviews pasted" },
      { source: "autocomplete", status: "error", count: 0, message: "Autocomplete failed for every query" },
    ]);
    expect(report.gaps).toEqual([]);
    expect(findGaps).not.toHaveBeenCalled();
  });

  it("returns 502 with a readable message when Claude fails", async () => {
    const res = await request(
      appWith({
        analyzer: {
          ...deps.analyzer,
          findGaps: async () => {
            throw new AnalysisError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.");
          },
        },
      }),
    )
      .post("/api/check")
      .send({ niche: "budget spreadsheet" });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("API key was rejected");
  });

  it("returns 502 when the Niche Finder has no inputs at all", async () => {
    const res = await request(
      appWith({
        reddit: { ...deps.reddit, searchSubreddits: async () => [] },
        autocomplete: { suggest: async () => [] },
      }),
    )
      .post("/api/niches")
      .send({ category: "spreadsheet" });
    expect(res.status).toBe(502);
    expect(res.body.error).toContain("nothing to ground niches in");
  });
});
