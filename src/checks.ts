import { OUTPUT_MARKER } from "./markers.ts";

// The in-run checks (ADR-0001): code, not judgement, decides whether an output may be written.
// Messages name the problem, never the offending text, so an error cannot carry it into the output.

/** Problems with one item; an empty list means the item may be shown to Maya. */
export function checkItem(item: unknown, bannedWords: string[]): string[] {
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
  if (containsBannedWord(item, bannedWords)) problems.push("contains a banned brand word");
  if (JSON.stringify(item).includes(OUTPUT_MARKER)) problems.push("contains a forbidden marker");
  return problems;
}

/** Problems with a whole result, given the ids that came in. */
export function checkResult(result: unknown, inputIds: string[], bannedWords: string[]): string[] {
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
    for (const problem of checkItem(item, bannedWords)) problems.push(`item ${index + 1}: ${problem}`);
  });
  (skipped ?? []).forEach((entry, index) => {
    if (!isObject(entry) || !nonEmptyString(entry.id) || !nonEmptyString(entry.reason)) {
      problems.push(`skipped ${index + 1}: needs an id and a reason`);
    }
  });

  const landed = new Map<string, number>();
  const land = (id: unknown) => {
    if (typeof id === "string") landed.set(id, (landed.get(id) ?? 0) + 1);
  };
  for (const item of items ?? []) if (isObject(item) && Array.isArray(item.source_ids)) item.source_ids.forEach(land);
  for (const entry of skipped ?? []) if (isObject(entry)) land(entry.id);
  for (const id of inputIds) {
    const count = landed.get(id) ?? 0;
    if (count === 0) problems.push(`input id ${id} is in neither an item nor skipped`);
    if (count > 1) problems.push(`input id ${id} lands ${count} times instead of once`);
  }
  for (const id of landed.keys()) {
    if (!inputIds.includes(id)) problems.push(`id ${id} is not in the input`);
  }

  if (containsBannedWord({ items: result.items, skipped: result.skipped }, bannedWords)) {
    problems.push("output contains a banned brand word");
  }
  if (JSON.stringify(result).includes(OUTPUT_MARKER)) problems.push("output contains a forbidden marker");
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
