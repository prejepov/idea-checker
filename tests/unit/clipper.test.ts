import { describe, expect, it } from "vitest";
import { appendClip, buildBookmarklet, formatClip, type Clip } from "../../shared/clipper";
import { parsePasted } from "../../server/sources/pasted";

const post: Clip = {
  kind: "post",
  title: "I wish there was a budget sheet for irregular income",
  body: "I'm self-employed.\n\n\nEvery template assumes a fixed paycheck.   \nThanks u/helper_bot and /u/someone-else",
  subreddit: "r/budget",
  url: "https://www.reddit.com/r/budget/comments/abc123/i_wish/",
};

describe("formatClip", () => {
  it("makes one paste-box entry: title, body without blank lines, source line, trailing blank line", () => {
    expect(formatClip(post)).toBe(
      "I wish there was a budget sheet for irregular income\n" +
        "I'm self-employed.\nEvery template assumes a fixed paycheck.\nThanks u/[user] and /u/[user]\n" +
        "— r/budget · https://www.reddit.com/r/budget/comments/abc123/i_wish/\n\n",
    );
  });

  it("parses back as exactly one Reddit entry, and stacked clips as separate entries", () => {
    expect(parsePasted(formatClip(post))).toHaveLength(1);
    expect(parsePasted(formatClip(post) + formatClip({ ...post, title: "Another" }))).toHaveLength(2);
  });

  it("marks highlighted excerpts and works without a title", () => {
    const out = formatClip({ kind: "selection", title: "", body: "Same problem here", subreddit: "r/budget", url: null });
    expect(out).toBe("Same problem here\n— excerpt · r/budget\n\n");
  });

  it("caps very long bodies", () => {
    const out = formatClip({ ...post, body: "x".repeat(5000) });
    expect(out.split("\n")[1]).toHaveLength(1201); // 1200 + ellipsis
  });
});

describe("appendClip", () => {
  it("adds the first clip without leading space", () => {
    expect(appendClip("", "A\nB\n\n")).toEqual({ text: "A\nB", added: true });
  });
  it("separates clips with exactly one blank line", () => {
    expect(appendClip("A\n\n\n", "B")).toEqual({ text: "A\n\nB", added: true });
  });
  it("skips duplicates and empty clipboards", () => {
    expect(appendClip("A\n\nB", "B\n\n")).toEqual({ text: "A\n\nB", added: false, reason: "Already added." });
    expect(appendClip("A", "  ")).toEqual({ text: "A", added: false, reason: "The clipboard is empty." });
  });
});

describe("buildBookmarklet", () => {
  const href = buildBookmarklet();
  const source = decodeURIComponent(href.slice("javascript:".length));

  it("is a javascript: URL with valid, self-contained source", () => {
    expect(href.startsWith("javascript:")).toBe(true);
    expect(() => new Function(source)).not.toThrow();
    expect(source).not.toMatch(/\b(import|require|__name|exports)\b/);
  });

  it("contains no characters that break when stored as a bookmark", () => {
    expect(href.slice("javascript:".length)).not.toMatch(/[\s"<>#]/);
  });
});
