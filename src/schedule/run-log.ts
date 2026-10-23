import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { storedSnapshots } from "../capture/index.ts";
import { watchedPages } from "../config/competitors.ts";
import type { WatchedPage } from "../domain/types.ts";

// The run log: one JSON line per workflow run, committed in the repo (runs/run-log.jsonl),
// so the history of every scheduled and manual run sits next to the snapshots it produced.
// A run that crashed before writing its result still gets a line.

export interface RunLogEntry {
  /** When the workflow step started the run, before any page was opened. */
  started_at: string;
  /** How many watched pages got a new snapshot in this run. */
  pages_fetched: number;
  pages_watched: number;
  /** The run's cost from result.json; null when the run wrote no result. */
  cost_usd: number | null;
  /** The run's errors from result.json, plus any problem reading it. */
  errors: string[];
}

/** The log line for one run, from its start time, its result.json and the snapshots folder. */
export function runLogEntry(options: {
  startedAt: Date;
  resultPath: string;
  snapshotsDir: string;
  pages?: WatchedPage[];
}): RunLogEntry {
  const pages = options.pages ?? watchedPages();
  const result = readRun(options.resultPath);
  return {
    started_at: options.startedAt.toISOString(),
    pages_fetched: pagesFetched(options.snapshotsDir, pages, options.startedAt),
    pages_watched: pages.length,
    cost_usd: result.cost_usd,
    errors: result.errors,
  };
}

export function appendRunLog(logPath: string, entry: RunLogEntry): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

/** Pages with a snapshot captured at or after the start: the ones this run fetched and stored. */
function pagesFetched(snapshotsDir: string, pages: WatchedPage[], startedAt: Date): number {
  return pages.filter((page) => {
    try {
      return storedSnapshots(snapshotsDir, page).some((snapshot) => Date.parse(snapshot.captured_at) >= startedAt.getTime());
    } catch {
      return false;
    }
  }).length;
}

function readRun(resultPath: string): Pick<RunLogEntry, "cost_usd" | "errors"> {
  if (!existsSync(resultPath)) return { cost_usd: null, errors: ["the run wrote no result.json"] };
  try {
    const run: unknown = (JSON.parse(readFileSync(resultPath, "utf8")) as { run?: unknown }).run;
    const { cost_usd, errors } = (run ?? {}) as { cost_usd?: unknown; errors?: unknown };
    if (typeof cost_usd === "number" && Array.isArray(errors) && errors.every((error) => typeof error === "string")) {
      return { cost_usd, errors };
    }
  } catch {
    // Falls through to the error below.
  }
  return { cost_usd: null, errors: ["result.json could not be read"] };
}
