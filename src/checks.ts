import { OUTPUT_MARKER } from "./markers.ts";

// The in-run checks (ADR-0001): code, not judgement, decides whether an output may be written.
// Messages name the problem and a position, never the offending text or a raw id, so an
// error cannot carry forbidden text into the output.

export interface CheckContext {
  /** The ids that came in, in input order. */
  inputIds: string[];
  bannedWords: string[];
  /** Secret-like config values that must never be written. */
  secrets: string[];
}

/** Problems with one item; an empty list means the item may be shown to Maya. */
export function checkItem(item: unknown, context: Omit<CheckContext, "inputIds">): string[] {
  if (!isObject(item)) return ["item is not an object"];
  const problems: string[] = [];
  if (!nonEmptyString(item.id)) problems.push("no id");
  if (!Array.isArray(item.source_ids) || item.source_ids.length === 0 || !item.source_ids.every(nonEmptyString)) {
    problems.push("no source ids");
  }
  if (typeof item.confidence !== "number" || !(item.confidence >= 0 && item.confidence <= 1)) {
    problems.push("confidence is not between 0 and 1");
  }
  if (!nonEmptyString(item.action)) problems.push("no action");
  if (!nonEmptyString(item.why)) problems.push("no why");
  if (!nonEmptyString(item.link) || !/^https?:\/\/\S+$/.test(item.link)) problems.push("no link to the competitor's page");
  if (!nonEmptyString(item.cta)) problems.push("no call to action");
  const { id: _id, source_ids: _sourceIds, ...text } = item;
  if (containsBannedWord(text, context.bannedWords)) problems.push("contains a banned brand word");
  problems.push(...forbiddenValues(item, context.secrets));
  return problems;
}

/** Problems with a whole result. */
export function checkResult(result: unknown, context: CheckContext): string[] {
  if (!isObject(result)) return ["result is not an object"];
  const problems: string[] = [];

  if (result.built_for !== "maya") problems.push('wrapper: built_for is not "maya"');
  const items = Array.isArray(result.items) ? result.items : undefined;
  const skipped = Array.isArray(result.skipped) ? result.skipped : undefined;
  if (!items) problems.push("wrapper: items is not a list");
  if (!skipped) problems.push("wrapper: skipped is not a list");
  const run = isObject(result.run) ? result.run : undefined;
  if (!run) {
    problems.push("wrapper: run is missing");
  } else {
    if (!nonEmptyString(run.started_at) || Number.isNaN(Date.parse(run.started_at))) {
      problems.push("wrapper: run.started_at is not an ISO 8601 time");
    }
    if (typeof run.cost_usd !== "number") problems.push("wrapper: run.cost_usd is not a number");
    if (!Array.isArray(run.errors)) problems.push("wrapper: run.errors is not a list");
  }

  (items ?? []).forEach((item, index) => {
    for (const problem of checkItem(item, context)) problems.push(`item ${index + 1}: ${problem}`);
  });
  (skipped ?? []).forEach((entry, index) => {
    if (!isObject(entry) || !nonEmptyString(entry.id) || !nonEmptyString(entry.reason)) {
      problems.push(`skipped ${index + 1}: needs an id and a reason`);
    } else if (containsBannedWord(entry.reason, context.bannedWords)) {
      problems.push(`skipped ${index + 1}: reason contains a banned brand word`);
    }
  });

  const landed = new Map<string, number>();
  const land = (id: unknown) => {
    if (typeof id === "string") landed.set(id, (landed.get(id) ?? 0) + 1);
  };
  for (const item of items ?? []) if (isObject(item) && Array.isArray(item.source_ids)) item.source_ids.forEach(land);
  for (const entry of skipped ?? []) if (isObject(entry)) land(entry.id);
  context.inputIds.forEach((id, index) => {
    const count = landed.get(id) ?? 0;
    if (count === 0) problems.push(`input signal ${index + 1} is in neither an item nor skipped`);
    if (count > 1) problems.push(`input signal ${index + 1} lands ${count} times instead of once`);
  });
  const unknown = [...landed.keys()].filter((id) => !context.inputIds.includes(id)).length;
  if (unknown > 0) problems.push(`${unknown} id(s) in the output are not in the input`);

  problems.push(...forbiddenValues(result, context.secrets).map((problem) => `output ${problem}`));
  return problems;
}

/** The marker and secret-like values are forbidden anywhere, ids and errors included. */
export function forbiddenValues(value: unknown, secrets: string[]): string[] {
  const json = JSON.stringify(value) ?? "";
  const problems: string[] = [];
  if (json.includes(OUTPUT_MARKER)) problems.push("contains a forbidden marker");
  if (secrets.some((secret) => json.includes(JSON.stringify(secret).slice(1, -1)))) {
    problems.push("contains a secret-like config value");
  }
  return problems;
}

function containsBannedWord(value: unknown, bannedWords: string[]): boolean {
  if (bannedWords.length === 0) return false;
  const patterns = bannedWords.map((word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
  return strings(value).some((text) => patterns.some((pattern) => pattern.test(text)));
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (isObject(value)) return Object.values(value).flatMap(strings);
  return [];
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
