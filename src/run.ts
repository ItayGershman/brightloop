import { checkItem, checkResult, forbiddenValues } from "./checks/index.ts";
import { AUDIENCE } from "./config/audience.ts";
import type { Item, Result, RunInput, SkippedSignal } from "./domain/types.ts";
import { judgingRules } from "./judging/rules.ts";
import { runRules, type Rule } from "./judging/run-rules.ts";
import { itemWeeks } from "./judging/week.ts";

/**
 * One run: judges every signal in the input, puts each input id in exactly one place,
 * and applies the in-run checks before anything is returned. Never throws on bad input.
 */
export function run(input: RunInput, options: { startedAt?: Date; rules?: Rule[] } = {}): Result {
  const errors = [...input.errors];
  const items: Item[] = [];
  const skipped: SkippedSignal[] = [];
  const inputIds = input.signals.map((signal) => signal.id);
  const context = { inputIds, bannedWords: input.bannedWords, secrets: input.secrets };
  const weekOf = itemWeeks(input);

  let judgedItems = 0;
  for (const judgement of runRules(input.signals, options.rules ?? judgingRules(input.ownPricing))) {
    if (judgement.kind === "skipped") {
      skipped.push(judgement.skipped);
      continue;
    }
    // An item that fails a check never reaches the audience: its signals are skipped with the reason.
    judgedItems += 1;
    judgement.item.week = weekOf(judgement.item);
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
    built_for: AUDIENCE.builtFor,
    items,
    skipped,
    run: { started_at: (options.startedAt ?? new Date()).toISOString(), cost_usd: 0, errors },
  };
  errors.push(...checkResult(result, context));

  // Last line of defence: a forbidden value that got past every check above is never written.
  if (forbiddenValues({ items, skipped }, input.secrets).length > 0) {
    result.items = [];
    result.skipped = [];
    errors.push("output withheld: it would have contained a forbidden value");
  }
  return result;
}
