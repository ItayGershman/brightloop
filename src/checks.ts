import { containsBannedWord } from "./checks/banned-words.ts";
import { forbiddenValues } from "./checks/forbidden-values.ts";
import { idCoverage } from "./checks/id-coverage.ts";
import { itemRequirements } from "./checks/item-requirements.ts";
import { isRecord } from "./checks/rules.ts";
import { skippedEntryRequirements, wrapperRequirements } from "./checks/wrapper-requirements.ts";

// The in-run checks (ADR-0001): code, not judgement, decides whether an output may be written.
// Messages name the problem and a position, never the offending text or a raw id, so an
// error cannot carry forbidden text into the output. This file is the only import point;
// the parts in checks/ are internal.

export { forbiddenValues };

export interface CheckContext {
  /** The ids that came in, in input order. */
  inputIds: string[];
  bannedWords: string[];
  /** Secret-like config values that must never be written. */
  secrets: string[];
}

/** Problems with one item; an empty list means the item may be shown to the audience. */
export function checkItem(item: unknown, context: Omit<CheckContext, "inputIds">): string[] {
  if (!isRecord(item)) return ["item is not an object"];
  const { id: _id, source_ids: _sourceIds, ...text } = item;
  return [
    ...itemRequirements(item),
    ...(containsBannedWord(text, context.bannedWords) ? ["contains a banned brand word"] : []),
    ...forbiddenValues(item, context.secrets),
  ];
}

/** Problems with a whole result. */
export function checkResult(result: unknown, context: CheckContext): string[] {
  if (!isRecord(result)) return ["result is not an object"];
  const items = Array.isArray(result.items) ? result.items : [];
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  return [
    ...wrapperRequirements(result),
    ...items.flatMap((item, index) => checkItem(item, context).map((problem) => `item ${index + 1}: ${problem}`)),
    ...skipped.flatMap((entry, index) =>
      skippedEntryRequirements(entry, context.bannedWords).map((problem) => `skipped ${index + 1}: ${problem}`),
    ),
    ...idCoverage(items, skipped, context.inputIds),
    ...forbiddenValues(result, context.secrets).map((problem) => `output ${problem}`),
  ];
}
