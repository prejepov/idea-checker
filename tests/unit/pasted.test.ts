import { describe, expect, it } from "vitest";
import { parseCsvRow, parsePasted, pastedToEvidence } from "../../server/sources/pasted";

describe("parsePasted: plain text", () => {
  it("splits on blank lines and trims", () => {
    const text = "Great layout but no way to track irregular income.\n\n\n  Formulas broke when I added a category.  \r\n\r\nOk.";
    expect(parsePasted(text)).toEqual([
      { text: "Great layout but no way to track irregular income." },
      { text: "Formulas broke when I added a category." },
      { text: "Ok." },
    ]);
  });

  it("keeps multi-line reviews together", () => {
    expect(parsePasted("line one\nline two\n\nnext")).toEqual([{ text: "line one\nline two" }, { text: "next" }]);
  });

  it("returns [] for empty input", () => {
    expect(parsePasted("   \n  ")).toEqual([]);
  });
});

describe("parsePasted: CSV", () => {
  it("reads text + rating columns, with quoted commas and newlines", () => {
    const csv = 'rating,text,date\n3,"Nice, but confusing setup",2026-01-01\n3,"Two\nlines",2026-01-02\n4,,2026-01-03';
    expect(parsePasted(csv)).toEqual([
      { text: "Nice, but confusing setup", rating: 3 },
      { text: "Two\nlines", rating: 3 },
    ]);
  });

  it("accepts a 'review' column without ratings", () => {
    expect(parsePasted('review,stars\n"Too basic",n/a')).toEqual([{ text: "Too basic" }]);
  });

  it("treats a single-column first line as plain text, not CSV", () => {
    expect(parsePasted("text\n\nmore")).toEqual([{ text: "text" }, { text: "more" }]);
  });
});

describe("parseCsvRow", () => {
  it("handles escaped quotes", () => {
    expect(parseCsvRow('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });
});

describe("pastedToEvidence", () => {
  it("tags with the given prefix and offset", () => {
    const ev = pastedToEvidence([{ text: "a", rating: 3 }, { text: "b" }], "reddit", "r", 5);
    expect(ev).toEqual([
      { id: "r5", source: "reddit", text: "a", rating: 3 },
      { id: "r6", source: "reddit", text: "b" },
    ]);
  });
});
