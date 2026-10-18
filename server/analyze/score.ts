import type {
  ClaudeGap,
  EtsyDemand,
  EvidenceItem,
  GapLabel,
  NicheCandidate,
  NicheGate,
  ScoredGap,
  SourceKind,
} from "../../shared/schema";

/** Stage 2 Etsy gate: the niche has proven demand (11:48) if the top seller clears the bar or the 24h badge was seen. */
export function etsyGatePasses(etsy: EtsyDemand, minMonthlyRevenue: number): boolean {
  return (etsy.topMonthlyRevenue ?? 0) >= minMonthlyRevenue || etsy.badgeSeen;
}

/**
 * Scores Claude's gaps without trusting Claude's judgement of agreement:
 * ids that don't exist are dropped, and sources are counted from the real evidence.
 */
export function scoreGaps(gaps: ClaudeGap[], evidence: EvidenceItem[], etsyGatePass: boolean): ScoredGap[] {
  const byId = new Map(evidence.map((e) => [e.id, e]));
  const scored = gaps.map((gap): ScoredGap => {
    const unique = [...new Set(gap.evidence_ids.map((id) => id.trim()))];
    const validEvidenceIds = unique.filter((id) => byId.has(id));
    const droppedEvidenceIds = unique.filter((id) => !byId.has(id));
    const sourceSet = new Set<SourceKind>(validEvidenceIds.map((id) => byId.get(id)!.source));
    const sources = (["reddit", "review", "autocomplete"] as const).filter((s) => sourceSet.has(s));
    const sourcesHit = sources.length;
    return {
      ...gap,
      validEvidenceIds,
      droppedEvidenceIds,
      sources,
      sourcesHit,
      label: labelFor(sourcesHit, etsyGatePass),
      lowMoat: gap.canva20.copyable,
    };
  });
  return scored.sort(
    (a, b) => b.sourcesHit - a.sourcesHit || b.validEvidenceIds.length - a.validEvidenceIds.length,
  );
}

/** Validated = all three sources agree AND Etsy proves demand (14:04). Without the Etsy gate, 3/3 is only promising. */
export function labelFor(sourcesHit: number, etsyGatePass: boolean): GapLabel {
  if (sourcesHit >= 3) return etsyGatePass ? "validated" : "promising";
  if (sourcesHit === 2) return "promising";
  if (sourcesHit === 1) return "weak";
  return "unsupported";
}

/** Stage 1 gate: Canva-copyable fails (3:42); unknown revenue waits; below the bar fails (1:40). */
export function nicheGate(
  c: Pick<NicheCandidate, "canva20" | "topMonthlyRevenue">,
  minMonthlyRevenue: number,
): NicheGate {
  if (c.canva20.copyable) return "fail-moat";
  if (c.topMonthlyRevenue === null) return "pending";
  if (c.topMonthlyRevenue < minMonthlyRevenue) return "fail-revenue";
  return "pass";
}

const GATE_ORDER: Record<NicheGate, number> = { pass: 0, pending: 1, "fail-revenue": 2, "fail-moat": 3 };

/** Shortlist order: passing first (by revenue, badge breaks ties), then pending, then failed. */
export function rankNiches(candidates: NicheCandidate[]): NicheCandidate[] {
  return [...candidates].sort(
    (a, b) =>
      GATE_ORDER[a.gate] - GATE_ORDER[b.gate] ||
      (b.topMonthlyRevenue ?? -1) - (a.topMonthlyRevenue ?? -1) ||
      Number(b.badgeSeen) - Number(a.badgeSeen),
  );
}
