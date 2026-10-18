import { describe, expect, it } from "vitest";
import { PAIN_TEMPLATES, painQuery, redditSearchUrl } from "../../shared/reddit";

describe("redditSearchUrl", () => {
  it("builds a reddit.com post search for the niche + phrase", () => {
    const url = new URL(redditSearchUrl("  budget spreadsheet ", '"I wish there was"'));
    expect(url.origin + url.pathname).toBe("https://www.reddit.com/search/");
    expect(url.searchParams.get("q")).toBe('budget spreadsheet "I wish there was"');
    expect(url.searchParams.get("type")).toBe("posts");
  });

  it("uses the same query text as the API search", () => {
    for (const phrase of PAIN_TEMPLATES) {
      expect(new URL(redditSearchUrl("x", phrase)).searchParams.get("q")).toBe(painQuery("x", phrase));
    }
  });
});
