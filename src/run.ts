import { checkItem, checkResult, forbiddenValues } from "./checks.ts";
import { judge, RULES, type Rule } from "./judge.ts";
import type { Item, Result, SkippedSignal, Source } from "./types.ts";

/**
 * One run: judges every signal from the source, puts each input id in exactly one place,
 * and applies the in-run checks before anything is returned. Never throws on bad input.
 */
export function run(source: Source, options: { startedAt?: Date; rules?: Rule[] } = {}): Result {
  const errors = [...source.errors];
  const items: Item[] = [];
  const skipped: SkippedSignal[] = [];
  const inputIds = source.signals.map((signal) => signal.id);
  const context = { inputIds, bannedWords: source.bannedWords, secrets: source.secrets };

  let judgedItems = 0;
  for (const judgement of judge(source.signals, options.rules ?? RULES)) {
    if (judgement.kind === "skipped") {
      skipped.push(judgement.skipped);
      continue;
    }
    // An item that fails a check never reaches Maya: its signals are skipped with the reason.
    judgedItems += 1;
    const problems = checkItem(judgement.item, context);
    if (problems.length > 0) {
      errors.push(`item ${judgedItems} held back: ${problems.join("; ")}`);
      for (const id of judgement.item.source_ids) {
        skipped.push({ id, reason: `held back by the in-run checks: ${problems.join("; ")}` });
      }
      continue;
    }
    items.push(judgement.item);
  }

  const result: Result = {
    built_for: "maya",
    items,
    skipped,
    run: { started_at: (options.startedAt ?? new Date()).toISOString(), cost_usd: 0, errors },
  };
  errors.push(...checkResult(result, context));

  // Last line of defence: a forbidden value that got past every check above is never written.
  if (forbiddenValues({ items, skipped }, source.secrets).length > 0) {
    result.items = [];
    result.skipped = [];
    errors.push("output withheld: it would have contained a forbidden value");
  }
  return result;
}
