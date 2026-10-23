import { AUDIENCE } from "../config/audience.ts";
import { containsBannedWord } from "./banned-words.ts";
import { brokenRules, isNonEmptyString, isRecord, type FieldRule } from "./field-rules.ts";

/** The fixed shape around the items. */
const WRAPPER_RULES: FieldRule[] = [
  { field: "built_for", test: (value) => value === AUDIENCE.builtFor, problem: `built_for is not "${AUDIENCE.builtFor}"` },
  { field: "items", test: Array.isArray, problem: "items is not a list" },
  { field: "skipped", test: Array.isArray, problem: "skipped is not a list" },
  { field: "run", test: isRecord, problem: "run is missing" },
];

/** Checked only once `run` is an object. */
const RUN_RULES: FieldRule[] = [
  { field: "started_at", test: isIsoTime, problem: "run.started_at is not an ISO 8601 time" },
  { field: "cost_usd", test: (value) => typeof value === "number", problem: "run.cost_usd is not a number" },
  { field: "errors", test: Array.isArray, problem: "run.errors is not a list" },
];

const NEEDS_ID_AND_REASON = "needs an id and a reason";

/** Every skipped entry; both rules share one message, reported once. */
const SKIPPED_RULES: FieldRule[] = [
  { field: "id", test: isNonEmptyString, problem: NEEDS_ID_AND_REASON },
  { field: "reason", test: isNonEmptyString, problem: NEEDS_ID_AND_REASON },
];

export function wrapperRequirements(result: Record<string, unknown>): string[] {
  const problems = brokenRules(result, WRAPPER_RULES);
  if (isRecord(result.run)) problems.push(...brokenRules(result.run, RUN_RULES));
  return problems.map((problem) => `wrapper: ${problem}`);
}

export function skippedEntryRequirements(entry: unknown, bannedWords: string[]): string[] {
  if (!isRecord(entry)) return [NEEDS_ID_AND_REASON];
  const missing = brokenRules(entry, SKIPPED_RULES);
  if (missing.length > 0) return missing.slice(0, 1);
  return containsBannedWord(entry.reason, bannedWords) ? ["reason contains a banned brand word"] : [];
}

function isIsoTime(value: unknown): boolean {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}
