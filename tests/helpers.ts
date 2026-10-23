import { readFileSync } from "node:fs";
import { storedSnapshots } from "../src/capture/index.ts";
import { watchedPages } from "../src/config/competitors.ts";
import type { Result, RunInput } from "../src/domain/types.ts";
import { liveInput } from "../src/input/live-input.ts";
import { parseCasesFile } from "../src/input/parse-cases-file.ts";
import type { Rule } from "../src/judging/run-rules.ts";
import { run } from "../src/run.ts";

export const STARTED_AT = new Date("2026-10-26T06:30:00.000Z");

export function briefExample(): Record<string, any> {
  return JSON.parse(readFileSync("cases/brief-example/input.json", "utf8"));
}

/** The seam every judging test goes through: a cases.json text in, a result out. */
export function runCases(input: unknown, rules?: Rule[]): Result {
  return run(parseCasesFile(typeof input === "string" ? input : JSON.stringify(input)), { startedAt: STARTED_AT, rules });
}

export function pricingSignal(fields: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "pr-1",
    type: "pricing",
    competitor: "Lovable",
    source: "lovable.dev/pricing",
    ts: "2026-10-23T08:00:00Z",
    text: "Pro plan shown at $25/month (was $20 last week).",
    ...fields,
  };
}

/** A live run's input as on the first run: each watched page's earliest committed snapshot, so every page is a baseline. */
export function firstRunInput(): RunInput {
  const snapshots = watchedPages().flatMap((page) => storedSnapshots("snapshots", page).slice(0, 1));
  return liveInput(snapshots.map((current) => ({ current })), []);
}

/** Every input id, from items and skipped, sorted. */
export function landedIds(result: Result): string[] {
  return [...result.items.flatMap((item) => item.source_ids), ...result.skipped.map((entry) => entry.id)].sort();
}
