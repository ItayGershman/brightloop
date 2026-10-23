import { PAGE_NAMES, type Item, type PageKind, type Result } from "../domain/types.ts";
import { COLUMNS } from "./tabs.ts";

export { COLUMNS };

// A result as rows of Maya's sheet: one row per item, each cell in its column (tabs.ts).
// Skipped signals and run errors are not rows: the sheet is her record of changes, and the
// skipped list with its reasons is in result.json and on the live page. Pure: the CSV and
// the Sheet are written from these same rows.

/** One row per item, in COLUMNS order; the date is the run's day in the given time zone. */
export function renderRows(result: Result, timeZone: string): string[][] {
  const date = runDate(result.run.started_at, timeZone);
  return result.items.map((item) => row(item, date));
}

function row(item: Item, date: string): string[] {
  const cells: Record<(typeof COLUMNS)[number], string> = {
    date,
    competitor: item.competitor,
    page: PAGE_NAMES[item.page as PageKind] ?? item.page,
    "what changed": item.what_changed,
    before: item.before ?? "",
    after: item.after ?? "",
    "link to the page": item.link,
    // The call to action has no column of its own: it ends the notes.
    notes: [item.notes, `Next: ${item.cta}`].filter(Boolean).join(" "),
    action: item.action,
    why: item.why,
    // Plain words first, the score after: never a bare score.
    confidence: `${item.confidence_label} (${item.confidence})`,
  };
  return COLUMNS.map((column) => cells[column]);
}

/** "2026-10-26": the run's calendar day in the zone; empty when the start time cannot be read. */
function runDate(startedAt: string, timeZone: string): string {
  const moment = new Date(startedAt);
  if (Number.isNaN(moment.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
