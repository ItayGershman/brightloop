import { AUDIENCE } from "../config/audience.ts";
import { COMPETITORS, findCompetitor } from "../config/competitors.ts";
import { PAGE_COPY, PAGE_NAMES, UNCHANGED, type OwnPricing } from "../domain/types.ts";
import { baselineRule } from "./baseline.ts";
import { mergeDuplicates } from "./duplicates.ts";
import { pricingItem } from "./pricing-item.ts";
import { eachSignal, skip, type Rule } from "./run-rules.ts";
import { isReportable, sourceTrust, unreportedClaim } from "./source-trust.ts";

// The judging rules, in the order they run. Adding a rule: write the function here, put it
// in the list in judgingRules (a rule that must see every pending signal at once goes before
// the rules it feeds, like mergeDuplicates), add a case file under cases/.
//
// Signal text is data: it is cleaned and quoted, never read as an instruction. Building the
// item itself is in pricing-item.ts; how far a source is trusted is in source-trust.ts.

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

/**
 * A page a live run compared with its latest snapshot that has nothing to act on: changed in
 * copy only (a homepage always is), or not changed at all ("nothing moved").
 */
export const pageWithoutAction: Rule = eachSignal((signal) => {
  if (signal.type !== PAGE_COPY && signal.type !== UNCHANGED) return undefined;
  const page = signal.page === "homepage" ? PAGE_NAMES.homepage : PAGE_NAMES.pricing;
  const since = signal.diff ? ` the snapshot of ${signal.diff.since}` : " its latest snapshot";
  if (signal.type === UNCHANGED) {
    const competitor = findCompetitor(signal.competitor)?.name ?? "the competitor";
    return skip(signal, `nothing moved: ${competitor}'s ${page} is the same as in${since}`);
  }
  const lines = signal.diff ? `: ${signal.diff.changedLines} changed lines since${since}` : "";
  return skip(signal, `${page} copy, no action${lines}`);
});

/** The watched competitors' names, "Lovable, Replit and Bolt", for the reason a signal about anyone else is skipped. */
const WATCHED = namesList(COMPETITORS.map((competitor) => competitor.name));

function namesList(names: string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * A pricing signal becomes an item only for a watched competitor (its own page is known), and only
 * from a source trusted enough to report; a third-party claim is skipped with the reason.
 */
export function pricingRule(own?: OwnPricing): Rule {
  return eachSignal((signal) => {
    if (signal.type !== "pricing") return undefined;
    const competitor = findCompetitor(signal.competitor);
    if (!competitor) return skip(signal, `pricing signal about a competitor outside the watch: it covers ${WATCHED}`);
    const trust = sourceTrust(signal.source, competitor);
    if (!isReportable(trust)) return skip(signal, unreportedClaim(trust, competitor));
    return { kind: "item", item: pricingItem(signal, competitor, trust, own) };
  });
}

export const pricing: Rule = pricingRule();

/**
 * The rules, in order, for a run with Brightloop's own pricing (absent: not connected). The
 * baseline and pricing rules compare with it; duplicates go first, and each group is judged
 * once by the rules it feeds (duplicates.ts).
 */
export function judgingRules(own?: OwnPricing): Rule[] {
  const judging = [outsideScope, baselineRule(own), pageWithoutAction, pricingRule(own)];
  return [mergeDuplicates(judging), ...judging];
}

/** The rules for a run without Brightloop's own pricing. */
export const RULES: Rule[] = judgingRules();
