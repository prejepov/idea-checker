import type {
  CheckRequest,
  NicheCandidate,
  NicheRequest,
  NicheRun,
  NicheUpdate,
  RunReport,
  SourceStatus,
} from "../shared/schema";
import type { Analyzer } from "./analyze/claude";
import { etsyGatePasses, nicheGate, rankNiches, scoreGaps } from "./analyze/score";
import type { AutocompleteClient } from "./sources/autocomplete";
import { suggestionsToEvidence } from "./sources/autocomplete";
import { SourceSkipped } from "./sources/errors";
import { parsePasted, pastedToEvidence } from "./sources/pasted";
import { postsToEvidence, type RedditClient } from "./sources/reddit";
import { newId, type Store } from "./store";

export interface Deps {
  reddit: Pick<RedditClient, "searchPainPosts" | "searchSubreddits">;
  autocomplete: Pick<AutocompleteClient, "suggest">;
  analyzer: Analyzer;
  store: Store;
  now?: () => Date;
}

/** A run that can't continue for a reason the user should see. */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

/** Runs one source; a skip or failure becomes a status line instead of failing the whole run. */
async function collect<T>(source: string, fn: () => Promise<T[]>): Promise<{ items: T[]; status: SourceStatus }> {
  try {
    const items = await fn();
    return { items, status: { source, status: "ok", count: items.length } };
  } catch (err) {
    const status = err instanceof SourceSkipped ? "skipped" : "error";
    return { items: [], status: { source, status, count: 0, message: (err as Error).message } };
  }
}

// ---------- Stage 1 ----------

export async function runNicheFinder(deps: Deps, req: NicheRequest): Promise<NicheRun> {
  const now = deps.now?.() ?? new Date();
  const [phrases, subreddits] = await Promise.all([
    collect("autocomplete", () => deps.autocomplete.suggest(req.category, "niche")),
    collect("reddit", () => deps.reddit.searchSubreddits(req.category)),
  ]);
  if (phrases.items.length === 0 && subreddits.items.length === 0) {
    throw new PipelineError(
      "Neither autocomplete nor Reddit returned anything for this category, so there's nothing to ground niches in.",
    );
  }
  const { result, usage } = await deps.analyzer.findNiches(req.category, phrases.items, subreddits.items);
  const candidates: NicheCandidate[] = result.candidates.map((c, i) => {
    const base = { ...c, id: `n${i + 1}`, topMonthlyRevenue: null, badgeSeen: false };
    return { ...base, gate: nicheGate(base, req.minMonthlyRevenue) };
  });
  const run: NicheRun = {
    id: newId(now),
    createdAt: now.toISOString(),
    category: req.category,
    minMonthlyRevenue: req.minMonthlyRevenue,
    sources: [phrases.status, subreddits.status],
    phrases: phrases.items,
    subreddits: subreddits.items,
    candidates: rankNiches(candidates),
    usage,
  };
  await deps.store.saveNiche(run);
  return run;
}

/** Saves the Profittree numbers you typed in and re-applies the gate. */
export async function updateNicheRun(deps: Deps, id: string, update: NicheUpdate): Promise<NicheRun | null> {
  const run = await deps.store.getNiche(id);
  if (!run) return null;
  const min = update.minMonthlyRevenue ?? run.minMonthlyRevenue;
  const edits = new Map(update.candidates.map((c) => [c.id, c]));
  const candidates = run.candidates.map((c) => {
    const edit = edits.get(c.id);
    const next = edit ? { ...c, topMonthlyRevenue: edit.topMonthlyRevenue, badgeSeen: edit.badgeSeen } : c;
    return { ...next, gate: nicheGate(next, min) };
  });
  const updated: NicheRun = { ...run, minMonthlyRevenue: min, candidates: rankNiches(candidates) };
  await deps.store.saveNiche(updated);
  return updated;
}

// ---------- Stage 2 ----------

export async function runCheck(deps: Deps, req: CheckRequest): Promise<RunReport> {
  const now = deps.now?.() ?? new Date();
  const [reddit, autocomplete] = await Promise.all([
    collect("reddit", () => deps.reddit.searchPainPosts(req.niche)),
    collect("autocomplete", () => deps.autocomplete.suggest(req.niche, "gap")),
  ]);

  const redditEvidence = postsToEvidence(reddit.items);
  const pastedReddit = pastedToEvidence(parsePasted(req.redditText), "reddit", "r", redditEvidence.length + 1);
  const reviews = pastedToEvidence(parsePasted(req.reviewsText), "review", "v");
  const evidence = [...redditEvidence, ...pastedReddit, ...reviews, ...suggestionsToEvidence(autocomplete.items)];

  const sources: SourceStatus[] = [reddit.status];
  if (pastedReddit.length > 0) sources.push({ source: "reddit (pasted)", status: "ok", count: pastedReddit.length });
  sources.push(
    reviews.length > 0
      ? { source: "reviews", status: "ok", count: reviews.length }
      : { source: "reviews", status: "skipped", count: 0, message: "No reviews pasted" },
    autocomplete.status,
  );

  const etsyGatePass = etsyGatePasses(req.etsy, req.minMonthlyRevenue);
  let gaps: RunReport["gaps"] = [];
  let usage: RunReport["usage"] = null;
  if (evidence.length > 0) {
    const out = await deps.analyzer.findGaps(req.niche, evidence);
    gaps = scoreGaps(out.result.gaps, evidence, etsyGatePass);
    usage = out.usage;
  }

  const report: RunReport = {
    id: newId(now),
    createdAt: now.toISOString(),
    niche: req.niche,
    etsy: req.etsy,
    minMonthlyRevenue: req.minMonthlyRevenue,
    etsyGatePass,
    sources,
    evidence,
    gaps,
    usage,
    ...(req.fromNicheRun ? { fromNicheRun: req.fromNicheRun } : {}),
  };
  await deps.store.saveRun(report);
  return report;
}
