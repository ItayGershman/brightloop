import type { OwnPricing, Result, RunInput } from "../domain/types.ts";
import { run } from "../run.ts";
import { isoWeek } from "../text/zoned-time.ts";
import { googleSheet, SheetError } from "./google-sheet.ts";
import { readOwnPricing } from "./own-pricing.ts";
import { renderRows } from "./rows.ts";
import type { SheetKeys, SheetStore } from "./store.ts";
import { COLUMNS } from "./tabs.ts";

export type { SheetKeys, SheetStore };

// A run that reaches Maya's sheet: Brightloop's own pricing is read from the own-pricing tab
// first, the run judges with it, and its rows are appended to the changes tab. With no Sheet
// (no keys) nothing here touches the network: the rows come back for the CSV only.
//
// A re-run in the same ISO week appends only rows the tab does not have yet: a row is already
// there when one with the same week (from its date), competitor, page, what changed, before
// and after is. The same change in a later week is a new row. The changes tab's columns are
// found by its header, so a row lands under the right names if Maya reorders or adds columns.
//
// The Sheet fails the run (exit 1) when it cannot be reached, read or written, and when the
// own-pricing tab holds something unusable (no tier or price column, a price that is not a
// number): either way a comparison Maya expects is missing, and the scheduled job must be
// red. The rows are still appended and written to the CSV; run.errors says what went wrong.

/** The Sheet when both keys are set; otherwise none, and the adapter is never built. */
export function sheetFromEnv(
  env: Record<string, string | undefined>,
  connect: (keys: SheetKeys) => SheetStore = googleSheet,
): SheetStore | undefined {
  const credentials = env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const sheetId = env.SHEET_ID?.trim();
  if (!credentials || !sheetId) return undefined;
  return connect({ credentials, sheetId });
}

export interface Delivered {
  result: Result;
  /** Every row of this run, for the CSV, whether or not it was appended. */
  rows: string[][];
  appended: number;
  alreadyInSheet: number;
  /** True when the Sheet could not be read or written, or its own-pricing tab is unusable; the problem is in result.run.errors. */
  sheetFailed: boolean;
}

export async function runAndDeliver(input: RunInput, options: { sheet?: SheetStore; startedAt?: Date } = {}): Promise<Delivered> {
  const { sheet, startedAt } = options;
  let sheetFailed = false;
  let ownPricing: OwnPricing | undefined;
  const errors = [...input.errors];
  if (sheet) {
    try {
      const read = readOwnPricing(await sheet.readOwnPricing());
      ownPricing = read.ownPricing;
      errors.push(...read.errors);
      sheetFailed = read.errors.length > 0;
    } catch (error) {
      sheetFailed = true;
      ownPricing = { state: "unreadable" };
      errors.push(`could not read the own-pricing tab${reason(error)}, so no comparison is made`);
    }
  }

  const result = run({ ...input, errors, ownPricing }, { startedAt });
  const rows = renderRows(result, input.timezone);
  const delivered: Delivered = { result, rows, appended: 0, alreadyInSheet: 0, sheetFailed };
  if (!sheet || rows.length === 0) return delivered;

  try {
    const existing = await sheet.readChanges();
    const layout = tabLayout(existing[0]);
    const written = new Set(existing.slice(layout.header ? 1 : 0).map((cells) => rowKey((column) => cellAt(cells, layout, column))));
    const fresh = rows.filter((row) => {
      const key = rowKey((column) => row[COLUMNS.indexOf(column)]);
      if (written.has(key)) return false;
      written.add(key);
      return true;
    });
    delivered.alreadyInSheet = rows.length - fresh.length;
    if (fresh.length > 0) {
      const arranged = fresh.map((row) => layout.columns.map((column) => (column ? row[COLUMNS.indexOf(column)] : "")));
      await sheet.appendChanges(layout.header ? arranged : [[...COLUMNS], ...arranged]);
      delivered.appended = fresh.length;
    }
  } catch (error) {
    delivered.sheetFailed = true;
    result.run.errors.push(`could not append the rows to the Sheet${reason(error)}; they are in the CSV`);
  }
  return delivered;
}

/** The adapter's own description of a failure, which holds no key; nothing from any other error. */
function reason(error: unknown): string {
  return error instanceof SheetError ? ` (${error.message})` : "";
}

type Column = (typeof COLUMNS)[number];

/** Where each of the changes tab's columns is: by its header, or in COLUMNS order when it has none. */
interface TabLayout {
  header: boolean;
  /** For each column of the tab, left to right, which of COLUMNS it is; null for one of Maya's own. */
  columns: (Column | null)[];
}

function tabLayout(first: unknown[] | undefined): TabLayout {
  const names = (first ?? []).map((cell) => String(cell ?? "").trim().toLowerCase());
  if (!names.includes(COLUMNS[0])) return { header: false, columns: [...COLUMNS] };
  const columns = names.map((name) => COLUMNS.find((column) => column === name) ?? null);
  // A column of ours missing from the header goes at the end, so no cell is lost.
  return { header: true, columns: [...columns, ...COLUMNS.filter((column) => !columns.includes(column))] };
}

function cellAt(cells: unknown[], layout: TabLayout, column: Column): string {
  const at = layout.columns.indexOf(column);
  return at < 0 ? "" : String(cells[at] ?? "");
}

const KEY_COLUMNS = ["competitor", "page", "what changed", "before", "after"] as const;

/** What makes a row the same change in the same week. */
function rowKey(cell: (column: Column) => string): string {
  return JSON.stringify([weekOf(cell("date")), ...KEY_COLUMNS.map(cell)]);
}

/** The ISO week of a "2026-10-26" date; the text itself when it is not one. */
function weekOf(date: string): string {
  const day = date.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? isoWeek(new Date(`${day}T12:00:00Z`), "UTC") : day;
}
