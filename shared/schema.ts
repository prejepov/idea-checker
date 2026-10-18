import { z } from "zod";

// ---------- Evidence (Stage 2 inputs) ----------

export const SourceKind = z.enum(["reddit", "review", "autocomplete"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const EvidenceItem = z.object({
  id: z.string(), // r1.., v1.., g1..
  source: SourceKind,
  text: z.string(),
  url: z.string().optional(),
  subreddit: z.string().optional(),
  rating: z.number().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItem>;

export const SourceStatus = z.object({
  source: z.string(),
  status: z.enum(["ok", "skipped", "error"]),
  count: z.number(),
  message: z.string().optional(),
});
export type SourceStatus = z.infer<typeof SourceStatus>;

// ---------- What Claude returns ----------
// Kept to plain strings/booleans/arrays so it maps cleanly onto structured outputs.

export const Moment = z.object({
  who: z.string(),
  where: z.string(),
  screen: z.string(),
  next_action: z.string(),
});
export type Moment = z.infer<typeof Moment>;

export const Canva20 = z.object({
  copyable: z.boolean(),
  reason: z.string(),
});

export const ClaudeGap = z.object({
  title: z.string(),
  problem: z.string(),
  evidence_ids: z.array(z.string()),
  fix: z.string(),
  moment: Moment,
  canva20: Canva20,
});
export type ClaudeGap = z.infer<typeof ClaudeGap>;

export const ClaudeGapResult = z.object({ gaps: z.array(ClaudeGap) });
export type ClaudeGapResult = z.infer<typeof ClaudeGapResult>;

export const ClaudeNiche = z.object({
  name: z.string(),
  etsy_search_term: z.string(),
  buyer: z.string(),
  moment: Moment,
  canva20: Canva20,
  why: z.string(),
});
export type ClaudeNiche = z.infer<typeof ClaudeNiche>;

export const ClaudeNicheResult = z.object({ candidates: z.array(ClaudeNiche) });
export type ClaudeNicheResult = z.infer<typeof ClaudeNicheResult>;

export const Usage = z.object({
  model: z.string(),
  input_tokens: z.number(),
  output_tokens: z.number(),
});
export type Usage = z.infer<typeof Usage>;

// ---------- Stage 1: Niche Finder ----------

export const NicheGate = z.enum(["pass", "pending", "fail-revenue", "fail-moat"]);
export type NicheGate = z.infer<typeof NicheGate>;

export const NicheCandidate = ClaudeNiche.extend({
  id: z.string(),
  topMonthlyRevenue: z.number().nullable(),
  badgeSeen: z.boolean(),
  gate: NicheGate,
});
export type NicheCandidate = z.infer<typeof NicheCandidate>;

export const Subreddit = z.object({
  name: z.string(),
  subscribers: z.number(),
  url: z.string(),
  description: z.string(),
});
export type Subreddit = z.infer<typeof Subreddit>;

export const NicheRequest = z.object({
  category: z.string().trim().min(2).max(80),
  minMonthlyRevenue: z.number().nonnegative().default(500),
});
export type NicheRequest = z.infer<typeof NicheRequest>;

export const NicheUpdate = z.object({
  minMonthlyRevenue: z.number().nonnegative().optional(),
  candidates: z.array(
    z.object({
      id: z.string(),
      topMonthlyRevenue: z.number().nonnegative().nullable(),
      badgeSeen: z.boolean(),
    }),
  ),
});
export type NicheUpdate = z.infer<typeof NicheUpdate>;

export const NicheRun = z.object({
  id: z.string(),
  createdAt: z.string(),
  category: z.string(),
  minMonthlyRevenue: z.number(),
  sources: z.array(SourceStatus),
  phrases: z.array(z.string()),
  subreddits: z.array(Subreddit),
  candidates: z.array(NicheCandidate),
  usage: Usage.nullable(),
});
export type NicheRun = z.infer<typeof NicheRun>;

// ---------- Stage 2: Gap Checker ----------

export const EtsyDemand = z.object({
  topMonthlyRevenue: z.number().nonnegative().nullable().default(null),
  price: z.number().nonnegative().nullable().default(null),
  badgeSeen: z.boolean().default(false),
});
export type EtsyDemand = z.infer<typeof EtsyDemand>;

export const CheckRequest = z.object({
  niche: z.string().trim().min(2).max(80),
  reviewsText: z.string().max(200_000).default(""),
  redditText: z.string().max(200_000).default(""), // fallback if the Reddit API is unavailable
  etsy: EtsyDemand.default({ topMonthlyRevenue: null, price: null, badgeSeen: false }),
  minMonthlyRevenue: z.number().nonnegative().default(1000),
  fromNicheRun: z.string().optional(),
});
export type CheckRequest = z.infer<typeof CheckRequest>;

export const GapLabel = z.enum(["validated", "promising", "weak", "unsupported"]);
export type GapLabel = z.infer<typeof GapLabel>;

export const ScoredGap = ClaudeGap.extend({
  validEvidenceIds: z.array(z.string()),
  droppedEvidenceIds: z.array(z.string()),
  sources: z.array(SourceKind),
  sourcesHit: z.number(),
  label: GapLabel,
  lowMoat: z.boolean(),
});
export type ScoredGap = z.infer<typeof ScoredGap>;

export const RunReport = z.object({
  id: z.string(),
  createdAt: z.string(),
  niche: z.string(),
  etsy: EtsyDemand,
  minMonthlyRevenue: z.number(),
  etsyGatePass: z.boolean(),
  sources: z.array(SourceStatus),
  evidence: z.array(EvidenceItem),
  gaps: z.array(ScoredGap),
  usage: Usage.nullable(),
  fromNicheRun: z.string().optional(),
});
export type RunReport = z.infer<typeof RunReport>;

export const RunSummary = z.object({
  id: z.string(),
  createdAt: z.string(),
  title: z.string(),
  detail: z.string(),
});
export type RunSummary = z.infer<typeof RunSummary>;

export const Health = z.object({
  mock: z.boolean(),
  keys: z.object({ anthropic: z.boolean(), reddit: z.boolean() }),
  model: z.string(),
});
export type Health = z.infer<typeof Health>;
