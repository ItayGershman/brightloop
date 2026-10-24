import type { Competitor } from "../config/competitors.ts";
import { statedLimit, type StatedLimit } from "../text/limit-change.ts";
import { PRICE } from "../text/patterns.ts";
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
  /** The limit the signal states, when it states no price; its move "more" is more for the same price. */
  limit: StatedLimit | null;
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
    limit: reading.before === null && reading.after === null && !reading.differentPeriods ? statedLimit(text) : null,
  };
}

/** How the after value is labelled when it may not be a list price. */
const AFTER_LABEL: Record<Promotion["kind"], string> = { none: "", promotion: " (promotional)", possible: " (possible promo, unconfirmed)" };

/**
 * The before and after values as shown: a snapshot diff's, else the prices the signal states
 * (for different periods too, shown as stated and never compared), else the limit it states,
 * else its one stated price as the after value. A promotional or possibly promotional after
 * value carries its label.
 */
export function shownPrices(
  { reading, promotion, limit, text }: PricingChange,
  diff?: { before: string | null; after: string | null },
): { before: string | null; after: string | null } {
  const shown = diff ?? stated(reading, limit, text);
  return { before: shown.before, after: shown.after === null ? null : `${shown.after}${AFTER_LABEL[promotion.kind]}` };
}

function stated(reading: PriceChange, limit: StatedLimit | null, text: string): { before: string | null; after: string | null } {
  if (reading.differentPeriods) return { before: reading.differentPeriods.earlier, after: reading.differentPeriods.later };
  if (reading.before !== null || reading.after !== null) return reading;
  if (limit) return limit;
  const prices = [...text.matchAll(PRICE)];
  return { before: null, after: prices.length === 1 ? prices[0][0] : null };
}
