import type { OwnPricing, Result, RunInput } from "../domain/types.ts";
import { run } from "../run.ts";
import { isoWeek } from "../text/zoned-time.ts";
import { googleSheet, SheetError } from "./google-sheet.ts";
import { readOwnPricing } from "./own-pricing.ts";
import { COLUMNS, renderRows } from "./rows.ts";

// A run that reaches Maya's sheet: Brightloop's own pricing is read from the own-pricing tab
// first, the run judges with it, and its rows are appended to the changes tab. With no Sheet
// (no keys) nothing here touches the network: the rows come back for the CSV only.
//
// A re-run in the same ISO week appends only rows the tab does not have yet: a row is already
// there when one with the same week (from its date), competitor, page, what changed, before
// and after is. The same change in a later week is a new row.

/** The Sheet as the run uses it; the Google adapter is one implementation, tests hold another. */
export interface SheetStore {
  /** The own-pricing tab's cells, header row first. */
  readOwnPricing(): Promise<unknown[][]>;
  /** The changes tab's cells, header row first. */
  readChanges(): Promise<unknown[][]>;
  appendChanges(rows: string[][]): Promise<void>;
}

export interface SheetKeys {
  /** The service account's JSON key. */
  credentials: string;
  sheetId: string;
}

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
  /** True when the Sheet could not be read or written; the problem is in result.run.errors. */
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
    const written = new Set(existing.slice(hasHeader(existing) ? 1 : 0).map((cells) => rowKey(cells.map(String))));
    const fresh = rows.filter((row) => !written.has(rowKey(row)));
    delivered.alreadyInSheet = rows.length - fresh.length;
    if (fresh.length > 0) {
      await sheet.appendChanges(hasHeader(existing) ? fresh : [[...COLUMNS], ...fresh]);
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

function hasHeader(cells: unknown[][]): boolean {
  return cells.length > 0 && String(cells[0][0] ?? "").trim().toLowerCase() === COLUMNS[0];
}

const KEY_COLUMNS = ["competitor", "page", "what changed", "before", "after"] as const;

/** What makes a row the same change in the same week. Rows are in COLUMNS order. */
function rowKey(cells: string[]): string {
  const at = (column: (typeof COLUMNS)[number]) => cells[COLUMNS.indexOf(column)] ?? "";
  return JSON.stringify([weekOf(at("date")), ...KEY_COLUMNS.map(at)]);
}

/** The ISO week of a "2026-10-26" date; the text itself when it is not one. */
function weekOf(date: string): string {
  const moment = new Date(`${date.trim()}T12:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(date.trim()) && !Number.isNaN(moment.getTime()) ? isoWeek(moment, "UTC") : date;
}
