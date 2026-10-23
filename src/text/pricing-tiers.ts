import type { Tier } from "../domain/types.ts";
import {
  BILLING_TEXT,
  CUSTOM_PRICE_LINE,
  FOOTNOTE_MARK_LINE,
  PAID_PRICE,
  PLAN_LIMIT_LINE,
  PLAN_NAME_LINE,
  PRICE_LINE,
  PRICE_LINE_PARTS,
  PRICE_PERIOD_LINE,
  WHITESPACE_RUN,
} from "./patterns.ts";

// Plans read from the visible lines of a pricing page, for any competitor: no page-specific
// code. A plan is a price line with a plan-name line at most two lines above it (the nearest
// one, past a tagline); its limits are the limit lines up to the next plan. The price, its
// period, a struck-out earlier price and the billing are kept apart, in the page's words, so
// a yearly-billed price is never read as a monthly one.

/** How many lines above a price its plan name may be: the name, then perhaps a tagline. */
const MAX_LINES_TO_NAME = 2;
/** How many lines under a price (past its period) may say how it is billed. */
const MAX_LINES_TO_BILLING = 3;

type Price = Omit<Tier, "name" | "limits">;
/** A price and the last line it was read from. */
type PriceBlock = Price & { lastLine: number };

/** True for a price above zero, as a plan's `price` holds it. */
export function isPaidPrice(price: string): boolean {
  return PAID_PRICE.test(price);
}

/** A plan and the lines it spans: from its name line up to, not including, the next plan's. */
export interface PlanSpan {
  tier: Tier;
  start: number;
  end: number;
  /** The plan's price block: its price line through its period and billing lines, inclusive. */
  priceFrom: number;
  priceTo: number;
}

/** Every plan on the page, in page order, each name once. Empty if the page shows none. */
export function pricingTiers(lines: string[]): Tier[] {
  return planSpans(lines).map((span) => span.tier);
}

/** A plan's price in one phrase: "$18/month, billed annually (struck-out $20)". */
export function shownPrice(tier: Tier): string {
  const billing = tier.billing ? `, ${tier.billing}` : "";
  const struck = tier.struck_price ? ` (struck-out ${tier.struck_price})` : "";
  return `${tier.price}${tier.period ?? ""}${billing}${struck}`;
}

/** Every plan on the page with the lines it spans; the last plan runs to the end of the page. */
export function planSpans(lines: string[]): PlanSpan[] {
  const starts: { name: string; at: number; priceAt: number; price: PriceBlock }[] = [];
  lines.forEach((line, priceAt) => {
    if (!PRICE_LINE.test(line) && !CUSTOM_PRICE_LINE.test(line)) return;
    for (let at = priceAt - 1; at >= Math.max(0, priceAt - MAX_LINES_TO_NAME); at -= 1) {
      if (!PLAN_NAME_LINE.test(lines[at])) continue;
      if (!starts.some((start) => start.name === lines[at] || start.at >= at)) {
        starts.push({ name: lines[at], at, priceAt, price: priceParts(lines, priceAt) });
      }
      return;
    }
  });

  return starts.map((start, index) => {
    const end = starts[index + 1]?.at ?? lines.length;
    const limits = lines.slice(start.at + 1, end).filter((line) => PLAN_LIMIT_LINE.test(line));
    const { lastLine, ...price } = start.price;
    return { tier: { name: start.name, ...price, limits: [...new Set(limits)] }, start: start.at, end, priceFrom: start.priceAt, priceTo: lastLine };
  });
}

/**
 * The price at this line, split into its parts. A line with two prices ("$20 $18") shows a
 * struck-out earlier price and the current one; the text keeps no strikethrough, so the
 * order says which is which. The period may sit on the next line, past a footnote mark, and
 * the billing on the price line or on one of the lines under it.
 */
function priceParts(lines: string[], at: number): PriceBlock {
  const parts = PRICE_LINE_PARTS.exec(lines[at]);
  let next = at + 1;
  while (next < lines.length && FOOTNOTE_MARK_LINE.test(lines[next])) next += 1;
  let period = parts?.[3];
  if (!period && PRICE_PERIOD_LINE.test(lines[next] ?? "")) {
    period = lines[next];
    next += 1;
  }
  const below = lines.slice(next, next + MAX_LINES_TO_BILLING).findIndex((text) => BILLING_TEXT.test(text));
  const billing = parts?.[4] && BILLING_TEXT.test(parts[4]) ? parts[4] : below >= 0 ? lines[next + below] : undefined;
  return {
    lastLine: below >= 0 && !(parts?.[4] && BILLING_TEXT.test(parts[4])) ? next + below : next - 1,
    price: parts ? (parts[2] ?? parts[1]) : lines[at],
    period: period ? period.replace(WHITESPACE_RUN, "") : null,
    struck_price: parts?.[2] ? parts[1] : null,
    billing: billing ? billing.toLowerCase() : null,
  };
}
