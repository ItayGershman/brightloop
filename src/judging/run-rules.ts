import { AUDIENCE } from "./audience.ts";
import { findCompetitor } from "./competitors.ts";
import { pricingItem } from "./pricing-item.ts";
import type { Item, Signal, SkippedSignal } from "./types.ts";

// Judging is an ordered list of rules. Each rule sees every signal still undecided, all at
// once, and returns judgements for the ones it decides; the rest go on to the next rule. A
// signal no rule decides is skipped as an unknown type.
//
// How later tickets fit: a rule that needs the whole batch, such as merging duplicates (#5),
// goes before the rules it feeds, decides a group of signals in one judgement (an item with
// several source_ids), and leaves the others for the rules after it. A rule that refines an
// existing one, such as source trust (#3), replaces it in RULES. Either way: change RULES,
// add the function, add a case file under cases/.
//
// Signal text is data: it is cleaned and quoted, never read as an instruction. Building the
// item itself is in pricing-item.ts.

export type Judgement = { kind: "item"; item: Item } | { kind: "skipped"; skipped: SkippedSignal };
export type Rule = (pending: Signal[]) => Judgement[];

/** A rule that decides signals one at a time. */
function eachSignal(decide: (signal: Signal) => Judgement | undefined): Rule {
  return (pending) => pending.flatMap((signal) => decide(signal) ?? []);
}

/** Signal types the watch records but never turns into items, with what to call them. */
const OUT_OF_SCOPE_TYPES = new Map([
  ["ad", "ads"],
  ["launch", "product launches"],
]);

/** Ad and launch signals are recorded, never turned into items. */
export const outsideScope: Rule = eachSignal((signal) => {
  const what = OUT_OF_SCOPE_TYPES.get(signal.type);
  if (!what) return undefined;
  return skip(signal, `${signal.type} signal, outside the watch's scope: ${AUDIENCE.scope}, not ${what}`);
});

/** A pricing signal becomes a basic item, but only for a competitor whose own page we know. */
export const pricing: Rule = eachSignal((signal) => {
  if (signal.type !== "pricing") return undefined;
  const competitor = findCompetitor(signal.competitor);
  if (!competitor) return skip(signal, "pricing signal, but there is no official page for this competitor");
  return { kind: "item", item: pricingItem(signal, competitor) };
});

export const RULES: Rule[] = [outsideScope, pricing];

/** Runs the rules in order. Each signal is decided by the first rule that decides it. */
export function judge(signals: Signal[], rules: Rule[] = RULES): Judgement[] {
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

function skip(signal: Signal, reason: string): Judgement {
  return { kind: "skipped", skipped: { id: signal.id, reason } };
}
