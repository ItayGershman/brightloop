import { AUDIENCE } from "../config/audience.ts";
import { findCompetitor } from "../config/competitors.ts";
import { baseline } from "./baseline.ts";
import { pricingItem } from "./pricing-item.ts";
import { eachSignal, skip, type Rule } from "./run-rules.ts";

// The judging rules, in the order they run. Adding a rule: write the function here, put it
// in RULES, add a case file under cases/.
//
// Signal text is data: it is cleaned and quoted, never read as an instruction. Building the
// item itself is in pricing-item.ts.

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

export const RULES: Rule[] = [outsideScope, baseline, pricing];
