import type { OwnPricing, OwnTier, Tier } from "../domain/types.ts";
import { PRICE, YEARLY } from "../text/patterns.ts";
import { isPaidPrice, shownPrice } from "../text/pricing-tiers.ts";
import { quotable } from "../text/quotable.ts";
import type { PricingChange } from "./change.ts";
import { planName, type ChangedPlan } from "./plan.ts";

// Leadership's first question: "are they still cheaper than us on that tier?". Brightloop's
// own prices come only from the own-pricing tab of the audience's sheet at run time. The
// answer names the Brightloop tier and says cheaper, the same or not, but never repeats a
// Brightloop amount: outputs are committed and shown on a public page, and the tab is
// internal data. Every price shown is the competitor's, quoted from the signal itself.
//
// Which Brightloop tier a plan is compared with goes by place in the lineup: a free plan
// with Brightloop's free tier (price 0), the lowest paid plan with Brightloop's cheapest
// paid tier, a higher plan with the next paid tier up (or the only one). A plan the change
// does not name, a promotional price, prices for another period, and a price billed yearly
// are not compared: the own-pricing tab is monthly.

export interface Comparison {
  /** The item's brightloop_comparison field. */
  comparison: string;
  /** The question and its answer, for the item's why. */
  stillCheaper: string;
}

const NOT_CONNECTED: OwnPricing = { state: "not connected" };

const NO_PAID_TIER = "the own-pricing tab lists no paid Brightloop tier";

/** Why there is no Brightloop price to compare with, when the tab was not read. */
const NO_TAB: Record<Exclude<OwnPricing["state"], "read">, string> = {
  "not connected": "Brightloop's own-pricing tab is not connected",
  empty: "Brightloop's own-pricing tab is empty",
  unreadable: "Brightloop's own-pricing tab could not be read",
};

/** The comparison with Brightloop on the tier that changed. */
export function compareWithBrightloop(change: PricingChange, own: OwnPricing = NOT_CONNECTED): Comparison {
  const shown = competitorPrice(change);
  const onTier = change.plan.place === "unknown" ? `the ${change.competitor} plan that changed` : planName(change.competitor, change.plan);
  const answer = (text: string) => ({ comparison: text, stillCheaper: `Still cheaper than us on ${onTier}? ${text}` });

  if (own.state !== "read") return answer(`Can't compare: ${NO_TAB[own.state]}, so no Brightloop price is used. ${shown}`);
  const cantCompare = (reason: string) => answer(`Can't compare with Brightloop: ${reason}. ${shown}`);
  const plan = change.plan;
  if (plan.place === "unknown") return cantCompare(`the change does not name one ${change.competitor} plan`);
  const name = planName(change.competitor, plan);
  if (plan.place === "free") {
    const free = freePlan(name, change.link, own.tiers, shown);
    return { comparison: free.comparison, stillCheaper: `Still cheaper than us on ${onTier}? ${free.answer}` };
  }

  const tier = brightloopTier(own.tiers, plan);
  if (!tier) return cantCompare(NO_PAID_TIER);
  const price = comparablePrice(change, name);
  if ("reason" in price) return cantCompare(price.reason);
  const { comparison, answer: yesOrNo } = verdict(price.shows, price.amount, tier);
  return { comparison, stillCheaper: `Still cheaper than us on ${onTier}? ${yesOrNo}` };
}

/** The baseline's comparison: the competitor's lowest paid plan against Brightloop's cheapest paid tier. */
export function baselineComparison(competitor: string, lowestPaid: Tier, own: OwnPricing = NOT_CONNECTED): string {
  const shows = `${competitor}'s lowest paid plan, ${lowestPaid.name}, shows ${shownPrice(lowestPaid)}`;
  if (own.state !== "read") return `Can't compare yet: ${NO_TAB[own.state]}. ${shows}.`;
  const tier = brightloopTier(own.tiers, { place: "lowestPaid", name: lowestPaid.name });
  if (!tier) return `Can't compare with Brightloop: ${NO_PAID_TIER}. ${shows}.`;
  if (!isPaidPrice(lowestPaid.price)) return `Can't compare with Brightloop: ${competitor}'s lowest paid plan shows no price. ${shows}.`;
  if (yearly(`${lowestPaid.period ?? ""} ${lowestPaid.billing ?? ""}`)) {
    return `Can't compare with Brightloop: ${competitor}'s lowest paid plan is billed yearly, and the own-pricing tab is monthly. ${shows}.`;
  }
  return verdict(shows, amount(lowestPaid.price), tier).comparison;
}

/** A Brightloop tier, named so that no amount is ever repeated. */
interface NamedTier {
  monthlyUsd: number;
  /** "Brightloop Starter", or its place when its name carries a number: "Brightloop's cheapest paid tier". */
  label: string;
}

/** How the competitor's price stands against the Brightloop tier's, by the sign of their difference. */
const VERDICTS: Record<"-1" | "0" | "1", { lead: string; relation: string; answer: string }> = {
  "-1": { lead: "Cheaper than", relation: "below", answer: "Yes" },
  "0": { lead: "Same price as", relation: "the same as", answer: "No" },
  "1": { lead: "Not cheaper than", relation: "above", answer: "No" },
};

/** The comparison field, and the answer to "still cheaper than us?". */
interface Verdict {
  comparison: string;
  answer: string;
}

function verdict(shows: string, competitorAmount: number, tier: NamedTier): Verdict {
  const { lead, relation, answer } = VERDICTS[String(Math.sign(competitorAmount - tier.monthlyUsd)) as "-1" | "0" | "1"];
  return {
    comparison: `${lead} ${tier.label}: ${shows}, ${relation} the monthly price in Brightloop's own-pricing tab.`,
    answer: `${answer}: ${shows}, ${relation} ${tier.label}'s monthly price in the own-pricing tab.`,
  };
}

function freePlan(name: string, link: string, tiers: OwnTier[], shown: string): Verdict {
  const free = tiers.find((tier) => tier.monthlyUsd === 0);
  if (!free) {
    const text = `${name} costs nothing, and the own-pricing tab lists no free Brightloop tier. ${shown}`;
    return { comparison: `Cheaper than Brightloop: ${text}`, answer: `Yes: ${text}` };
  }
  const text = `${name} and ${labelled(free, "free tier").label} cost nothing; compare what each includes on ${link} and in the own-pricing tab.`;
  return { comparison: `Both free: ${text}`, answer: `Both free: ${text}` };
}

/** The Brightloop tier a paid plan is compared with, by its place in the lineup. */
function brightloopTier(tiers: OwnTier[], plan: Exclude<ChangedPlan, { place: "unknown" }>): NamedTier | undefined {
  const paid = tiers.filter((tier) => tier.monthlyUsd > 0).sort((a, b) => a.monthlyUsd - b.monthlyUsd);
  if (paid.length === 0) return undefined;
  if (plan.place === "higher" && paid.length > 1) return labelled(paid[1], "second-cheapest paid tier");
  return labelled(paid[0], "cheapest paid tier");
}

function labelled(tier: OwnTier, place: string): NamedTier {
  const name = quotable(tier.name);
  const label = name && !/[\d$]/.test(name) ? `Brightloop ${name}` : `Brightloop's ${place}`;
  return { monthlyUsd: tier.monthlyUsd, label };
}

/** The competitor's current monthly price, when the signal states one that can be compared. */
function comparablePrice(
  { reading, listed, promotion, text }: PricingChange,
  plan: string,
): { shows: string; amount: number } | { reason: string } {
  if (reading.differentPeriods) return { reason: "the two prices are for different periods" };
  if (promotion.kind === "promotion") return { reason: "the price shown is a promotional price, not the list price" };
  if (promotion.kind === "possible") return { reason: "the price shown may be a promotional price" };
  const current = reading.after ?? listed ?? onlyPrice(text);
  if (!current) return { reason: "the signal states no current price" };
  if (yearly(current) || yearly(text)) return { reason: "the price is per year or billed yearly, and the own-pricing tab is monthly" };
  return { shows: `${plan} ${reading.after ? "now shows" : "shows"} ${current}`, amount: amount(current) };
}

/** Per year, or billed yearly ("$18/month, billed annually"): never set next to a monthly price. */
function yearly(text: string): boolean {
  return YEARLY.test(text);
}

function amount(price: string): number {
  return Number.parseFloat(price.slice(1));
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
