import { MONTHLY, PRICE, PRICE_ARROW, PRICE_DOWN_UP_FROM, PRICE_FROM_TO, WAS_PRICE, YEARLY } from "./patterns.ts";

export interface PriceChange {
  before: string | null;
  after: string | null;
  /** Both prices stated, but for different periods (per year vs per month): they are never compared. */
  differentPeriods: { earlier: string; later: string } | null;
}

const NO_CHANGE: PriceChange = { before: null, after: null, differentPeriods: null };

/**
 * Before and after prices, only when the text states both: "$25/month (was $20 last week)",
 * "$25 → $20", "from $25 to $20", "$20, down from $25", "$15/month (regular $25)". With "was" or "regular", the after price is the first price that is not
 * the "was" one. Two prices for different periods are not a change: see differentPeriods.
 */
export function priceChange(text: string): PriceChange {
  const pair = statedPair(text);
  if (!pair) return NO_CHANGE;
  const [before, after] = pair;
  if (!samePeriod(before, after)) return { ...NO_CHANGE, differentPeriods: { earlier: before, later: after } };
  return { before, after, differentPeriods: null };
}

function statedPair(text: string): [string, string] | undefined {
  const was = WAS_PRICE.exec(text);
  if (was) {
    const before = was[1];
    const beforeAt = was.index + was[0].length - before.length;
    const after = [...text.matchAll(PRICE)].find((match) => match.index !== beforeAt);
    return after ? [before, after[0]] : undefined;
  }
  const move = PRICE_ARROW.exec(text) ?? PRICE_FROM_TO.exec(text);
  if (move) return [move[1], move[2]];
  const downOrUp = PRICE_DOWN_UP_FROM.exec(text);
  return downOrUp ? [downOrUp[2], downOrUp[1]] : undefined;
}

type Period = "year" | "month" | "unstated";

function period(price: string): Period {
  if (YEARLY.test(price)) return "year";
  if (MONTHLY.test(price)) return "month";
  return "unstated";
}

/** An unstated period reads as monthly, the way pricing pages show prices; a yearly price never does. */
function samePeriod(a: string, b: string): boolean {
  const asMonthly = (p: Period) => (p === "unstated" ? "month" : p);
  return asMonthly(period(a)) === asMonthly(period(b));
}

/** True when the stated price went up ("$30/month (was $25)"). */
export function priceRose({ before, after }: PriceChange): boolean {
  return before !== null && after !== null && amount(after) > amount(before);
}

function amount(price: string): number {
  return Number.parseFloat(price.slice(1));
}
