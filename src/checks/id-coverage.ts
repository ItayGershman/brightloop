import countBy from "lodash/countBy.js";
import difference from "lodash/difference.js";
import { isRecord } from "./rules.ts";

/**
 * Every input id lands exactly once, in an item's source ids or in skipped, and no id is
 * invented. Signals are named by position, never by their raw id.
 */
export function idCoverage(items: unknown[], skipped: unknown[], inputIds: string[]): string[] {
  const landed = [
    ...items.flatMap((item) => (isRecord(item) && Array.isArray(item.source_ids) ? item.source_ids : [])),
    ...skipped.map((entry) => (isRecord(entry) ? entry.id : undefined)),
  ].filter((id): id is string => typeof id === "string");
  const counts = countBy(landed);

  const problems = inputIds.flatMap((id, index) => {
    const count = Object.hasOwn(counts, id) ? counts[id] : 0;
    if (count === 0) return [`input signal ${index + 1} is in neither an item nor skipped`];
    if (count > 1) return [`input signal ${index + 1} lands ${count} times instead of once`];
    return [];
  });
  const unknown = difference(Object.keys(counts), inputIds).length;
  if (unknown > 0) problems.push(`${unknown} id(s) in the output are not in the input`);
  return problems;
}
