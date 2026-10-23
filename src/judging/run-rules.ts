import type { Item, Signal, SkippedSignal } from "../domain/types.ts";

// The rule engine. Judging is an ordered list of rules (RULES in rules.ts). Each rule sees
// every signal still undecided, all at once, and returns judgements for the ones it decides;
// the rest go on to the next rule. A signal no rule decides is skipped as an unknown type.
//
// How later tickets fit: a rule that needs the whole batch, such as merging duplicates (#5),
// goes before the rules it feeds, decides a group of signals in one judgement (an item with
// several source_ids), and leaves the others for the rules after it. A rule that refines an
// existing one, such as source trust (#3), replaces it in JUDGING. Either way: change the list
// in rules.ts, add the function, add a case file under cases/.

export type Judgement = { kind: "item"; item: Item } | { kind: "skipped"; skipped: SkippedSignal };
export type Rule = (pending: Signal[]) => Judgement[];

/** A rule that decides signals one at a time. */
export function eachSignal(decide: (signal: Signal) => Judgement | undefined): Rule {
  return (pending) => pending.flatMap((signal) => decide(signal) ?? []);
}

export function skip(signal: Signal, reason: string): Judgement {
  return { kind: "skipped", skipped: { id: signal.id, reason } };
}

/** Runs the rules in order. Each signal is decided by the first rule that decides it. */
export function runRules(signals: Signal[], rules: Rule[]): Judgement[] {
  const judgements: Judgement[] = [];
  let pending = signals;
  for (const rule of rules) {
    if (pending.length === 0) break;
    const decided = rule(pending);
    judgements.push(...decided);
    const ids = new Set(decided.flatMap((j) => (j.kind === "item" ? j.item.source_ids : [j.skipped.id])));
    pending = pending.filter((signal) => !ids.has(signal.id));
  }
  for (const signal of pending) {
    judgements.push(
      skip(signal, signal.type === "" ? "signal has no type, so it was not judged" : "unknown signal type, so it was not judged"),
    );
  }
  return judgements;
}
