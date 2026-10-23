import type { PricingChange } from "./change.ts";
import { planName } from "./plan.ts";

// The action for a change seen on the competitor's own pricing page, and the answer to
// "should we respond?". Most of our trials start on the lowest paid tier, upgrading from the
// free plan, so a list-price change there leans to "respond now"; a higher tier leans to
// "watch"; a promotion is never a list-price change. Every "watch" says what would change the answer.
// Only the competitor's own pricing page row of TRUST_LEVELS (source-trust.ts) asks for this
// advice; every other reportable level gives its own "watch" until the page shows the change.

/** The action for a change that needs a response before the meeting. */
export const RESPOND_NOW = "respond now";

export interface Advice {
  action: string;
  shouldWeRespond: string;
}

const IF_ON_LOWER_TIERS = (competitor: string) =>
  `What would change the answer: ${competitor} making the same change on its lowest paid tier or its free plan.`;

/** Advice for a change confirmed on the competitor's own pricing page. */
export function advise({ competitor, link, promotion, plan: changed, reading }: PricingChange): Advice {
  const plan = planName(competitor, changed);
  if (promotion.kind === "promotion") {
    return {
      action: "watch 2 weeks",
      shouldWeRespond:
        `Not yet: this is a promotion (${promotion.markers.join(", ")}), not a list-price change. ` +
        `What would change the answer: ${plan} still showing the promotional price after the promotion ends.`,
    };
  }
  if (promotion.kind === "possible") {
    return {
      action: "watch 1 week",
      shouldWeRespond:
        `Not yet: this may be a promotion (${promotion.markers.join(", ")}) and the rules cannot tell. ` +
        `What would change the answer: the check showing a real list-price change on ${plan}.`,
    };
  }
  if (reading.differentPeriods) {
    const { earlier, later } = reading.differentPeriods;
    return {
      action: "watch 1 week",
      shouldWeRespond:
        `Not yet: ${later} and ${earlier} are for different periods, so they are not compared. ` +
        `What would change the answer: ${link} showing ${plan}'s price for the same period as before.`,
    };
  }
  switch (changed.place) {
    case "lowestPaid":
      return {
        action: RESPOND_NOW,
        shouldWeRespond: `Yes, respond now: ${changed.name} is ${competitor}'s lowest paid tier, the one most of our trials compare against.`,
      };
    case "free":
      return {
        action: RESPOND_NOW,
        shouldWeRespond: `Yes, respond now: it changes what ${plan} includes, and trials upgrade from the free plan.`,
      };
    case "higher":
      return {
        action: "watch 2 weeks",
        shouldWeRespond: `Not yet: ${changed.name} is above ${competitor}'s lowest paid tier, so few of our trials are affected. ${IF_ON_LOWER_TIERS(competitor)}`,
      };
    case "unknown":
      return {
        action: "watch 1 week",
        shouldWeRespond:
          `Not yet: the change does not name exactly one ${competitor} plan. ` +
          `What would change the answer: ${link} showing it is the lowest paid tier or the free plan.`,
      };
  }
}
