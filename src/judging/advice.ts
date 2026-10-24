import { AUDIENCE } from "../config/audience.ts";
import type { PricingChange } from "./change.ts";
import { planName } from "./plan.ts";

// The action for a change seen on the competitor's own pricing page, and the answer to
// "should we respond?". Most of our trials start on the lowest paid tier, upgrading from the
// free plan, so a change there is put to the audience as their call before the meeting, with
// the facts; the tool never makes that call itself (Maya, interviews/maya.md, messages 14 and
// 15), and without the comparison with Brightloop's own pricing it says it can't tell yet.
// More for the same price there is competitive but not urgent, so it is watched; a higher
// tier is watched; a promotion is never a list-price change. Every "watch" says what would
// change the answer.
// Only the competitor's own pricing page row of TRUST_LEVELS (source-trust.ts) asks for this
// advice; every other reportable level gives its own "watch" until the page shows the change.

/** The question every item's `why` answers second, after "still cheaper than us?"; the live page splits `why` on it. */
export const RESPOND_QUESTION = "Should we respond?";

/** The action for a change on the tier our trials start on: the audience decides, with the facts in the row. */
export const YOUR_CALL = `your call before ${AUDIENCE.meetingTime}`;

/** The same, when the comparison with Brightloop's own pricing could not be made. */
export const CANT_TELL = `can't tell yet: compare with our own pricing before ${AUDIENCE.meetingTime}`;

/** True for an action that puts a change to the audience before the meeting. */
export function isTheirCall(action: string): boolean {
  return action.startsWith(YOUR_CALL) || action.startsWith(CANT_TELL);
}

export interface Advice {
  action: string;
  shouldWeRespond: string;
}

const IF_ON_LOWER_TIERS = (competitor: string) =>
  `What would change the answer: ${competitor} making the same change on its lowest paid tier or its free plan.`;

/** Advice for a change confirmed on the competitor's own pricing page; `compared` says whether Brightloop's tier was set against it. */
export function advise({ competitor, link, promotion, plan: changed, reading, limits }: PricingChange, compared: boolean): Advice {
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
  if ((changed.place === "lowestPaid" || changed.place === "free") && limits === "more") {
    return {
      action: "watch 2 weeks",
      shouldWeRespond:
        `Not yet: ${plan} gives more for the same price, which is competitive but not urgent. ` +
        `What would change the answer: ${plan} still including it in two weeks, and it not being a promotion.`,
    };
  }
  switch (changed.place) {
    case "lowestPaid":
      return theirCall(`${changed.name} is ${competitor}'s lowest paid tier, the one most of our trials compare against.`, compared);
    case "free":
      return theirCall(`it changes what ${plan} includes, and trials upgrade from the free plan.`, compared);
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

/** A change for the audience to decide on: the facts are in the row, the call is theirs. */
function theirCall(reason: string, compared: boolean): Advice {
  if (compared) return { action: YOUR_CALL, shouldWeRespond: `Your call: ${capitalised(reason)} Before, after, the link and the comparison are in this row.` };
  return {
    action: CANT_TELL,
    shouldWeRespond: `Can't tell yet: there is no comparison with our own pricing. ${capitalised(reason)} Before ${AUDIENCE.meetingTime}, compare it with the own-pricing tab, then decide.`,
  };
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
