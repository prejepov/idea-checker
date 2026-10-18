import { readFileSync } from "node:fs";
import type { ClaudeGap, ClaudeNiche } from "../../shared/schema";
import type { Analyzer } from "./claude";

interface GapTheme extends Omit<ClaudeGap, "evidence_ids"> {
  keywords: string[];
}

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url), "utf8")) as T;

/** An id the mock always cites but that never exists, so the "drop invented ids" rule is visible in mock mode. */
export const MOCK_INVENTED_ID = "r999";

/**
 * Stands in for Claude in mock mode: assigns evidence to fixed budget-spreadsheet themes by keyword.
 * Works with whatever reviews are pasted, so the UI and tests exercise real scoring.
 */
export function createMockAnalyzer(): Analyzer {
  const themes = fixture<GapTheme[]>("mock-gap-themes.json");
  const niches = fixture<ClaudeNiche[]>("mock-niches.json");
  const usage = { model: "mock", input_tokens: 0, output_tokens: 0 };

  return {
    async findGaps(_niche, evidence) {
      const gaps: ClaudeGap[] = [];
      themes.forEach(({ keywords, ...theme }, i) => {
        const ids = evidence
          .filter((e) => keywords.some((k) => e.text.toLowerCase().includes(k)))
          .map((e) => e.id);
        if (ids.length === 0) return;
        gaps.push({ ...theme, evidence_ids: i === 0 ? [...ids, MOCK_INVENTED_ID] : ids });
      });
      return { result: { gaps }, usage };
    },
    async findNiches() {
      return { result: { candidates: niches }, usage };
    },
  };
}
