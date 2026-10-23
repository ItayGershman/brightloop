import { PRICE } from "../text/patterns.ts";
import type { PricingChange } from "./change.ts";
import { planName } from "./plan.ts";

// Leadership's first question: "are they still cheaper than us on that tier?". Brightloop's
// own prices come only from the own-pricing tab of the audience's sheet at run time; until
// it is connected the answer says so and shows the competitor's price. Never a sample number:
// every price shown is quoted from the signal itself.

export interface Comparison {
  /** The item's brightloop_comparison field. */
  comparison: string;
  /** The question and its answer, for the item's why. */
  stillCheaper: string;
}

const NOT_CONNECTED = "Can't compare: Brightloop's own-pricing tab is not connected, so no Brightloop price is used.";

/** The comparison with Brightloop on the tier that changed. */
export function compareWithBrightloop(change: PricingChange): Comparison {
  const shown = competitorPrice(change);
  const onTier = change.plan.place === "unknown" ? `the ${change.competitor} plan that changed` : planName(change.competitor, change.plan);
  return {
    comparison: `${NOT_CONNECTED} ${shown}`,
    stillCheaper: `Still cheaper than us on ${onTier}? ${NOT_CONNECTED} ${shown}`,
  };
}

/** What the competitor's price is, in words, from the signal alone. */
function competitorPrice({ competitor, link, plan: changed, text, reading, listed, promotion }: PricingChange): string {
  const plan = planName(competitor, changed);
  if (reading.differentPeriods) {
    const { earlier, later } = reading.differentPeriods;
    return `${plan} shows ${later}; it is not compared with the earlier ${earlier}, which is for a different period.`;
  }
  if (reading.after && promotion.kind === "none") return `${plan} now shows ${reading.after}.`;
  // The page's own price for the plan, unless a promotion may be what the page shows.
  const current = reading.after ?? (promotion.kind === "none" ? listed : null) ?? onlyPrice(text);
  if (!current && changed.place === "free") return `${plan} costs nothing; what it includes is on ${link}.`;
  if (!current) return `${plan}'s current price is on ${link}.`;
  if (promotion.kind === "promotion") return `${plan} shows ${current} as a promotional price; its list price is on ${link}.`;
  if (promotion.kind === "possible") return `${plan} shows ${current}, possibly a promotional price; its list price is on ${link}.`;
  return `${plan} shows ${current}.`;
}

/** The price a text states, only when it states exactly one: with several, which is current is not known. */
function onlyPrice(text: string): string | undefined {
  const prices = new Set(text.match(PRICE) ?? []);
  return prices.size === 1 ? [...prices][0] : undefined;
}
