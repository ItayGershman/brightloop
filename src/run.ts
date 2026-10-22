import { checkItem, checkResult } from "./checks.ts";
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
  const inputIds: string[] = [];

  for (const signal of source.signals) {
    if (inputIds.includes(signal.id)) {
      errors.push(`input id ${signal.id} appears more than once; only the first was judged`);
      continue;
    }
    inputIds.push(signal.id);

    const judgement = judge(signal, options.rules ?? RULES);
    if (judgement.kind === "skipped") {
      skipped.push(judgement.skipped);
      continue;
    }
    // An item that fails a check never reaches Maya: its signals are skipped with the reason.
    const problems = checkItem(judgement.item, source.bannedWords);
    if (problems.length > 0) {
      errors.push(`item ${judgement.item.id} held back: ${problems.join("; ")}`);
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
  errors.push(...checkResult(result, inputIds, source.bannedWords));
  return result;
}
