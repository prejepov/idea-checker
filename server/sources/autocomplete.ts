import type { EvidenceItem } from "../../shared/schema";
import { sleep, type FetchLike } from "./errors";

export type AutocompleteMode = "gap" | "niche";

const LETTERS = "abcdefghijklmnopqrstuvwxyz".split("");
const MAX_SUGGESTIONS = 100;

/** Query seeds. Gap mode looks for questions/needs (13:42); niche mode fans out into sub-niches. */
export function buildQueries(seed: string, mode: AutocompleteMode): string[] {
  const s = seed.trim().toLowerCase();
  const base =
    mode === "gap"
      ? [`how do i ${s}`, `why is ${s}`, `best ${s}`, `${s} for`, `${s} that`, `${s} without`]
      : [`${s} for`, `${s} to track`, `${s} template`, `${s} planner`, `best ${s}`];
  return [...base, ...LETTERS.map((l) => `${s} ${l}`)];
}

/** Response of client=firefox is `["query", ["s1", "s2", ...]]`. */
export function parseSuggestResponse(json: unknown): string[] {
  if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
  return (json[1] as unknown[]).filter((s): s is string => typeof s === "string");
}

export function suggestionsToEvidence(suggestions: string[]): EvidenceItem[] {
  return suggestions.map((text, i) => ({ id: `g${i + 1}`, source: "autocomplete" as const, text }));
}

export interface AutocompleteConfig {
  fetchImpl?: FetchLike;
  delayMs?: number;
}

export function createAutocompleteClient(cfg: AutocompleteConfig = {}) {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const delayMs = cfg.delayMs ?? 300;

  return {
    /**
     * Collects unique suggestions across all seed queries. Unofficial endpoint, light use only.
     * Individual failures are skipped; if every request fails, the error is thrown.
     */
    async suggest(seed: string, mode: AutocompleteMode): Promise<string[]> {
      const queries = buildQueries(seed, mode);
      const seen = new Set<string>();
      const out: string[] = [];
      let failures = 0;
      let lastError: unknown;
      for (const [i, q] of queries.entries()) {
        if (i > 0 && delayMs > 0) await sleep(delayMs);
        try {
          const url = `https://suggestqueries.google.com/complete/search?${new URLSearchParams({
            client: "firefox",
            hl: "en",
            ie: "UTF-8",
            oe: "UTF-8",
            q,
          })}`;
          const res = await fetchImpl(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          for (const s of parseSuggestResponse(await res.json())) {
            const key = s.trim().toLowerCase();
            if (!key || key === q || seen.has(key)) continue;
            seen.add(key);
            out.push(s.trim());
          }
        } catch (err) {
          failures++;
          lastError = err;
        }
        if (out.length >= MAX_SUGGESTIONS) break;
      }
      if (failures === queries.length) {
        throw new Error(`Autocomplete failed for every query: ${String(lastError)}`);
      }
      return out.slice(0, MAX_SUGGESTIONS);
    },
  };
}

export type AutocompleteClient = ReturnType<typeof createAutocompleteClient>;
