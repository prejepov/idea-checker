import { describe, expect, it } from "vitest";
import {
  buildQueries,
  createAutocompleteClient,
  parseSuggestResponse,
  suggestionsToEvidence,
} from "../../server/sources/autocomplete";

describe("buildQueries", () => {
  it("gap mode includes question prefixes and a-z", () => {
    const q = buildQueries("Budget Spreadsheet", "gap");
    expect(q).toContain("how do i budget spreadsheet");
    expect(q).toContain("budget spreadsheet for");
    expect(q).toContain("budget spreadsheet a");
    expect(q).toContain("budget spreadsheet z");
  });

  it("niche mode fans out into sub-niches", () => {
    const q = buildQueries("spreadsheet", "niche");
    expect(q).toContain("spreadsheet to track");
    expect(q).toContain("spreadsheet template");
    expect(q).not.toContain("how do i spreadsheet");
  });
});

describe("parseSuggestResponse", () => {
  it("reads the firefox client shape", () => {
    expect(parseSuggestResponse(["q", ["a", "b", 3]])).toEqual(["a", "b"]);
  });
  it("returns [] for anything else", () => {
    expect(parseSuggestResponse({})).toEqual([]);
    expect(parseSuggestResponse(["q"])).toEqual([]);
  });
});

describe("suggestionsToEvidence", () => {
  it("tags g1..gN", () => {
    expect(suggestionsToEvidence(["x", "y"])).toEqual([
      { id: "g1", source: "autocomplete", text: "x" },
      { id: "g2", source: "autocomplete", text: "y" },
    ]);
  });
});

describe("createAutocompleteClient", () => {
  it("de-duplicates case-insensitively and drops the query itself", async () => {
    const fetchImpl = async (url: string) => {
      const q = new URL(url).searchParams.get("q")!;
      return new Response(JSON.stringify([q, [q, "Budget Spreadsheet For Couples", "budget spreadsheet for couples", `${q} extra`]]));
    };
    const client = createAutocompleteClient({ fetchImpl, delayMs: 0 });
    const out = await client.suggest("budget spreadsheet", "gap");
    expect(out.filter((s) => s.toLowerCase() === "budget spreadsheet for couples")).toHaveLength(1);
    expect(out).not.toContain("how do i budget spreadsheet");
    expect(out.length).toBeLessThanOrEqual(100);
  });

  it("tolerates some failed queries", async () => {
    let n = 0;
    const fetchImpl = async () => {
      n++;
      if (n % 2 === 0) return new Response("nope", { status: 429 });
      return new Response(JSON.stringify(["q", [`s${n}`]]));
    };
    const out = await createAutocompleteClient({ fetchImpl, delayMs: 0 }).suggest("x", "niche");
    expect(out.length).toBeGreaterThan(0);
  });

  it("throws when every query fails", async () => {
    const fetchImpl = async () => new Response("blocked", { status: 403 });
    await expect(createAutocompleteClient({ fetchImpl, delayMs: 0 }).suggest("x", "gap")).rejects.toThrow(
      "Autocomplete failed for every query",
    );
  });
});
