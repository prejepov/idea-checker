import { describe, expect, it } from "vitest";
import type { ClaudeGap, EvidenceItem, NicheCandidate } from "../../shared/schema";
import { etsyGatePasses, labelFor, nicheGate, rankNiches, scoreGaps } from "../../server/analyze/score";

const evidence: EvidenceItem[] = [
  { id: "r1", source: "reddit", text: "a" },
  { id: "r2", source: "reddit", text: "b" },
  { id: "v1", source: "review", text: "c" },
  { id: "g1", source: "autocomplete", text: "d" },
];

const gap = (title: string, evidence_ids: string[], copyable = false): ClaudeGap => ({
  title,
  problem: "p",
  evidence_ids,
  fix: "f",
  moment: { who: "w", where: "w", screen: "s", next_action: "n" },
  canva20: { copyable, reason: "r" },
});

describe("etsyGatePasses (video numbers)", () => {
  it("passes the $19.76 listing at $13,990/month against a $1,000 bar", () => {
    expect(etsyGatePasses({ topMonthlyRevenue: 13990, price: 19.76, badgeSeen: false }, 1000)).toBe(true);
  });
  it("fails a $40/month top seller", () => {
    expect(etsyGatePasses({ topMonthlyRevenue: 40, price: null, badgeSeen: false }, 1000)).toBe(false);
  });
  it("passes on the 24h badge alone", () => {
    expect(etsyGatePasses({ topMonthlyRevenue: null, price: null, badgeSeen: true }, 1000)).toBe(true);
  });
});

describe("scoreGaps", () => {
  it("drops invented ids and counts sources from real evidence only", () => {
    const [scored] = scoreGaps([gap("x", ["r1", "r999", "v1", "zz"])], evidence, true);
    expect(scored!.validEvidenceIds).toEqual(["r1", "v1"]);
    expect(scored!.droppedEvidenceIds).toEqual(["r999", "zz"]);
    expect(scored!.sources).toEqual(["reddit", "review"]);
    expect(scored!.sourcesHit).toBe(2);
    expect(scored!.label).toBe("promising");
  });

  it("does not count two ids from the same source twice", () => {
    const [scored] = scoreGaps([gap("x", ["r1", "r2", "r1"])], evidence, true);
    expect(scored!.validEvidenceIds).toEqual(["r1", "r2"]);
    expect(scored!.sourcesHit).toBe(1);
    expect(scored!.label).toBe("weak");
  });

  it("validates 3/3 only when the Etsy gate passes", () => {
    const all = ["r1", "v1", "g1"];
    expect(scoreGaps([gap("x", all)], evidence, true)[0]!.label).toBe("validated");
    expect(scoreGaps([gap("x", all)], evidence, false)[0]!.label).toBe("promising");
  });

  it("marks a gap citing only invented ids as unsupported", () => {
    expect(scoreGaps([gap("x", ["nope"])], evidence, true)[0]!.label).toBe("unsupported");
  });

  it("flags Canva-copyable gaps as low moat", () => {
    expect(scoreGaps([gap("x", ["r1"], true)], evidence, true)[0]!.lowMoat).toBe(true);
  });

  it("sorts by sources hit, then by amount of evidence", () => {
    const out = scoreGaps(
      [gap("one-source", ["r1"]), gap("two-small", ["r1", "v1"]), gap("two-big", ["r1", "r2", "v1"]), gap("three", ["r1", "v1", "g1"])],
      evidence,
      true,
    );
    expect(out.map((g) => g.title)).toEqual(["three", "two-big", "two-small", "one-source"]);
  });
});

describe("labelFor", () => {
  it.each([
    [3, true, "validated"],
    [3, false, "promising"],
    [2, true, "promising"],
    [1, true, "weak"],
    [0, true, "unsupported"],
  ] as const)("%i sources, gate %s -> %s", (hits, gate, label) => {
    expect(labelFor(hits, gate)).toBe(label);
  });
});

const candidate = (id: string, topMonthlyRevenue: number | null, copyable = false, badgeSeen = false): NicheCandidate => ({
  id,
  name: id,
  etsy_search_term: id,
  buyer: "b",
  moment: { who: "w", where: "w", screen: "s", next_action: "n" },
  canva20: { copyable, reason: "r" },
  why: "y",
  topMonthlyRevenue,
  badgeSeen,
  gate: "pending",
});

describe("nicheGate (video numbers, $500 default bar)", () => {
  it("drops the $40/month category", () => {
    expect(nicheGate(candidate("x", 40), 500)).toBe("fail-revenue");
  });
  it("keeps the $13,990/month listing", () => {
    expect(nicheGate(candidate("x", 13990), 500)).toBe("pass");
  });
  it("drops Canva-copyable ideas even with high revenue", () => {
    expect(nicheGate(candidate("x", 8_040_000, true), 500)).toBe("fail-moat");
  });
  it("waits for a number when revenue is unknown", () => {
    expect(nicheGate(candidate("x", null), 500)).toBe("pending");
  });
  it("treats exactly the bar as passing", () => {
    expect(nicheGate(candidate("x", 500), 500)).toBe("pass");
  });
});

describe("rankNiches", () => {
  it("orders pass (by revenue) > pending > fail", () => {
    const cs = [
      { ...candidate("fail", 40), gate: "fail-revenue" as const },
      { ...candidate("pending", null), gate: "pending" as const },
      { ...candidate("small", 600), gate: "pass" as const },
      { ...candidate("big", 13990), gate: "pass" as const },
      { ...candidate("moat", 9000, true), gate: "fail-moat" as const },
    ];
    expect(rankNiches(cs).map((c) => c.id)).toEqual(["big", "small", "pending", "fail", "moat"]);
  });
});
