import { PRICE, WAS_PRICE } from "./patterns.ts";

export interface PriceChange {
  before: string | null;
  after: string | null;
}

const NO_CHANGE: PriceChange = { before: null, after: null };

/**
 * Before and after prices, only when the text states both ("$25/month (was $20 last week)").
 * The after price is the first price that is not the "was" one.
 */
export function priceChange(text: string): PriceChange {
  const was = WAS_PRICE.exec(text);
  if (!was) return NO_CHANGE;
  const before = was[1];
  const beforeAt = was.index + was[0].length - before.length;
  const after = [...text.matchAll(PRICE)].find((match) => match.index !== beforeAt);
  return after ? { before, after: after[0] } : NO_CHANGE;
}
