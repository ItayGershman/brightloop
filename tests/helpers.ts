import { readFileSync } from "node:fs";
import { run } from "../src/run.ts";
import { fileSource } from "../src/source.ts";
import type { Rule } from "../src/judge.ts";
import type { Result } from "../src/types.ts";

export const STARTED_AT = new Date("2026-10-26T06:30:00.000Z");

export function briefExample(): Record<string, any> {
  return JSON.parse(readFileSync("cases/brief-example/input.json", "utf8"));
}

/** The seam every judging test goes through: a cases.json text in, a result out. */
export function runCases(input: unknown, rules?: Rule[]): Result {
  return run(fileSource(typeof input === "string" ? input : JSON.stringify(input)), { startedAt: STARTED_AT, rules });
}

export function pricingSignal(fields: Record<string, unknown>): Record<string, unknown> {
  return { id: "pr-1", type: "pricing", competitor: "Lovable", source: "lovable.dev/pricing", ts: "2026-10-23T08:00:00Z", text: "Pro plan shown at $25/month (was $20 last week).", ...fields };
}
