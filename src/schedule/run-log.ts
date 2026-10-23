import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { storedSnapshots } from "../capture/index.ts";
import { watchedPages } from "../config/competitors.ts";
import type { SlackDelivery, WatchedPage } from "../domain/types.ts";

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
  /** The run's one Slack line from result.json; null when the run wrote none. */
  slack_line: string | null;
  /** Whether that line was posted ("posted", or why not); null when the run wrote none. */
  slack_status: SlackDelivery["status"] | null;
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
    ...result,
  };
}

export function appendRunLog(logPath: string, entry: RunLogEntry): void {
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
}

/** Every line of the run log, oldest first; a line that cannot be read is left out. No log is no history. */
export function readRunLog(logPath: string): RunLogEntry[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, "utf8")
    .split("\n")
    .flatMap((line) => {
      try {
        // Lines from before the Slack line existed have no slack fields.
        const entry = JSON.parse(line) as Partial<RunLogEntry>;
        if (typeof entry.started_at !== "string" || !Array.isArray(entry.errors)) return [];
        return [{ ...entry, errors: entry.errors.map(String), slack_line: entry.slack_line ?? null, slack_status: entry.slack_status ?? null } as RunLogEntry];
      } catch {
        return [];
      }
    });
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

type FromResult = Pick<RunLogEntry, "cost_usd" | "errors" | "slack_line" | "slack_status">;

function readRun(resultPath: string): FromResult {
  const noSlack = { slack_line: null, slack_status: null };
  if (!existsSync(resultPath)) return { cost_usd: null, errors: ["the run wrote no result.json"], ...noSlack };
  try {
    const written = JSON.parse(readFileSync(resultPath, "utf8")) as { run?: unknown; slack?: unknown };
    const { cost_usd, errors } = (written.run ?? {}) as { cost_usd?: unknown; errors?: unknown };
    const { line, status } = (written.slack ?? {}) as { line?: unknown; status?: unknown };
    if (typeof cost_usd === "number" && Array.isArray(errors) && errors.every((error) => typeof error === "string")) {
      const slack = typeof line === "string" && typeof status === "string" ? { slack_line: line, slack_status: status as SlackDelivery["status"] } : noSlack;
      return { cost_usd, errors, ...slack };
    }
  } catch {
    // Falls through to the error below.
  }
  return { cost_usd: null, errors: ["result.json could not be read"], ...noSlack };
}
