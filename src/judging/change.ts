import type { Competitor } from "../config/competitors.ts";
import { limitMove, type LimitMove } from "../text/limit-change.ts";
import { priceChange, priceRose, type PriceChange } from "../text/price-change.ts";
import { whichPlan, type ChangedPlan } from "./plan.ts";
import { findPromotion, type Promotion } from "./promotion.ts";

// What a pricing signal says changed, read once from its quoted text and source: the prices
// it states, any promotion markers, and the plan it is on. The action (advice.ts), the
// comparison (comparison.ts) and the item (pricing-item.ts) all read this one reading.

export interface PricingChange {
  competitor: string;
  /** The competitor's own pricing page. */
  link: string;
  /** The signal's quoted text. */
  text: string;
  /** The before and after prices the signal states, if any. */
  reading: PriceChange;
  /** The plan's current price as its pricing page shows it, when a snapshot diff read it. */
  listed: string | null;
  promotion: Promotion;
  plan: ChangedPlan;
  /** Which way a limit moved, when the signal states no price: "more" is more for the same price. */
  limits: LimitMove;
}

/** The change a signal's quoted text and source describe. */
export function readChange(text: string, source: string, competitor: Competitor, listed: string | null = null): PricingChange {
  const reading = priceChange(text);
  return {
    competitor: competitor.name,
    link: competitor.pricingPage,
    text,
    reading,
    listed,
    promotion: findPromotion(text, source, competitor.pricingPage, priceRose(reading)),
    plan: whichPlan(text, competitor),
    limits: reading.before === null && reading.after === null && !reading.differentPeriods ? limitMove(text) : null,
  };
}

/** A list-price change: the signal states both prices, for one period, and shows no promotion marker. */
export function listPriceChange({ reading, promotion }: PricingChange): { before: string | null; after: string | null } {
  return promotion.kind === "none" ? { before: reading.before, after: reading.after } : { before: null, after: null };
}
