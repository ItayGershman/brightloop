import _ from "lodash";
import type { Competitor } from "../config/competitors.ts";
import { FREE_PLAN, planNamePattern } from "../text/patterns.ts";

// Which of a competitor's plans a pricing signal is about, from the plan names in the
// registry. A text naming exactly one plan is about that plan; a text naming none, or more
// than one, is "unknown". Plan names match as written on the pricing page, case included,
// so "free forever" is not the plan "Free". The free plan named either way is one plan.

type Place = "free" | "lowestPaid" | "higher";

/** The plan a change is on, by its place in the competitor's lineup. */
export type ChangedPlan = { place: Place; name: string } | { place: "unknown" };

/** The plan a signal's quoted text names, when it names exactly one. */
export function whichPlan(text: string, competitor: Competitor): ChangedPlan {
  const named: { place: Place; name: string }[] = [];
  if (FREE_PLAN.test(text)) named.push({ place: "free", name: "free plan" });
  const places = [
    ["free", competitor.tiers.free],
    ["lowestPaid", competitor.tiers.lowestPaid],
    ["higher", competitor.tiers.higher],
  ] as const;
  for (const [place, names] of places) {
    for (const name of names) {
      if (planNamePattern(name).test(text)) named.push({ place, name });
    }
  }
  // Two plans named ("Pro Teams bundle") could be either: never guess which.
  const plans = _.uniqBy(named, (plan) => (plan.place === "free" ? "free" : plan.name));
  return plans.length === 1 ? plans[0] : { place: "unknown" };
}

/** The plan in words: "Lovable Pro", "Bolt's free plan", "Lovable". */
export function planName(competitor: string, plan: ChangedPlan): string {
  if (plan.place === "unknown") return competitor;
  if (plan.place === "free") return `${competitor}'s free plan`;
  return `${competitor} ${plan.name}`;
}
