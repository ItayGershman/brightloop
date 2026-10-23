import type { Tier } from "../domain/types.ts";
import {
  CUSTOM_PRICE_LINE,
  FOOTNOTE_MARK_LINE,
  PLAN_LIMIT_LINE,
  PLAN_NAME_LINE,
  PRICE_LINE,
  PRICE_PERIOD_LINE,
} from "./patterns.ts";

// Plans read from the visible lines of a pricing page, for any competitor: no page-specific
// code. A plan is a price line with a plan-name line at most two lines above it (the nearest
// one, past a tagline); its limits are the limit lines up to the next plan. Prices are kept
// as the page shows them.

/** How many lines above a price its plan name may be: the name, then perhaps a tagline. */
const MAX_LINES_TO_NAME = 2;

/** Every plan on the page, in page order, each name once. Empty if the page shows none. */
export function pricingTiers(lines: string[]): Tier[] {
  const starts: { name: string; at: number; price: string }[] = [];
  lines.forEach((line, priceAt) => {
    if (!PRICE_LINE.test(line) && !CUSTOM_PRICE_LINE.test(line)) return;
    for (let at = priceAt - 1; at >= Math.max(0, priceAt - MAX_LINES_TO_NAME); at -= 1) {
      if (!PLAN_NAME_LINE.test(lines[at])) continue;
      if (!starts.some((start) => start.name === lines[at] || start.at >= at)) {
        starts.push({ name: lines[at], at, price: shownPrice(lines, priceAt) });
      }
      return;
    }
  });

  return starts.map((start, index) => {
    const end = starts[index + 1]?.at ?? lines.length;
    const limits = lines.slice(start.at + 1, end).filter((line) => PLAN_LIMIT_LINE.test(line));
    return { name: start.name, price: start.price, limits: [...new Set(limits)] };
  });
}

/** The price line, plus the period line under it ("/month") if there is one, past a footnote mark. */
function shownPrice(lines: string[], at: number): string {
  let next = at + 1;
  while (next < lines.length && FOOTNOTE_MARK_LINE.test(lines[next])) next += 1;
  const period = PRICE_PERIOD_LINE.test(lines[next] ?? "") ? lines[next] : undefined;
  return period ? `${lines[at]} ${period}` : lines[at];
}
