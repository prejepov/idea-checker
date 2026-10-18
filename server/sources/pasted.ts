import type { EvidenceItem, SourceKind } from "../../shared/schema";

export interface PastedEntry {
  text: string;
  rating?: number;
}

const MAX_ENTRIES = 200;

/**
 * Parses pasted reviews (or pasted Reddit threads).
 * - CSV with a header row containing a `text` (or `review`) column; optional `rating`/`stars` column.
 * - Otherwise: plain text, entries separated by one or more blank lines.
 */
export function parsePasted(input: string): PastedEntry[] {
  const trimmed = input.replace(/\r\n?/g, "\n").trim();
  if (!trimmed) return [];
  const firstLine = trimmed.split("\n", 1)[0] ?? "";
  const header = parseCsvRow(firstLine).map((h) => h.trim().toLowerCase());
  const textCol = header.findIndex((h) => h === "text" || h === "review");
  if (header.length > 1 && textCol >= 0) {
    return parseCsv(trimmed, textCol, header);
  }
  return trimmed
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .slice(0, MAX_ENTRIES)
    .map((text) => ({ text }));
}

function parseCsv(input: string, textCol: number, header: string[]): PastedEntry[] {
  const ratingCol = header.findIndex((h) => h === "rating" || h === "stars");
  const rows = splitCsvRecords(input).slice(1);
  const out: PastedEntry[] = [];
  for (const row of rows) {
    const cells = parseCsvRow(row);
    const text = (cells[textCol] ?? "").trim();
    if (!text) continue;
    const rating = ratingCol >= 0 ? Number.parseFloat(cells[ratingCol] ?? "") : Number.NaN;
    out.push(Number.isFinite(rating) ? { text, rating } : { text });
    if (out.length >= MAX_ENTRIES) break;
  }
  return out;
}

/** Splits CSV text into records, keeping newlines that sit inside quotes. */
function splitCsvRecords(input: string): string[] {
  const records: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of input) {
    if (ch === '"') inQuotes = !inQuotes;
    if (ch === "\n" && !inQuotes) {
      records.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) records.push(current);
  return records;
}

export function parseCsvRow(row: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

export function pastedToEvidence(
  entries: PastedEntry[],
  source: SourceKind,
  prefix: string,
  startAt = 1,
): EvidenceItem[] {
  return entries.map((e, i) => ({
    id: `${prefix}${i + startAt}`,
    source,
    text: e.text,
    ...(e.rating !== undefined ? { rating: e.rating } : {}),
  }));
}
