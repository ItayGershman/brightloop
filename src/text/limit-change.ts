import { LIMIT_QUANTITY, LIMIT_UP_DOWN_FROM, QUOTED_LIMIT_PAIR } from "./patterns.ts";

// A limit a change states, when it states no price: the earlier and later values as written
// ('"100 monthly credits" is now "150 monthly credits"'; "10 apps, up from 3" reads as 3 apps
// and 10 apps) and which way it moved, "more" when the plan now includes more for the same
// price. Null when the text states no such pair, so a change is never read as more for the
// same price by guess.

export type LimitMove = "more" | "less" | null;

export interface StatedLimit {
  before: string;
  after: string;
  move: LimitMove;
}

export function statedLimit(text: string): StatedLimit | null {
  const quoted = QUOTED_LIMIT_PAIR.exec(text);
  if (quoted) return withMove(quoted[1], quoted[2]);
  const upOrDown = LIMIT_UP_DOWN_FROM.exec(text);
  if (!upOrDown) return null;
  const [, later, between, , earlier] = upOrDown;
  const unit = between.split(/[,;()]/)[0].trim();
  const withUnit = (number: string) => (unit ? `${number.trim()} ${unit}` : number.trim());
  return withMove(withUnit(earlier), withUnit(later));
}

/** Which way a stated limit moved; null when the text states none. */
export function limitMove(text: string): LimitMove {
  return statedLimit(text)?.move ?? null;
}

function withMove(before: string, after: string): StatedLimit {
  const [a, b] = [quantity(before), quantity(after)];
  const move = a === null || b === null || a === b ? null : b > a ? "more" : "less";
  return { before, after, move };
}

function quantity(text: string): number | null {
  const match = LIMIT_QUANTITY.exec(text);
  if (!match) return null;
  const scale = { k: 1e3, m: 1e6 }[(match[2] ?? "").toLowerCase()] ?? 1;
  return Number.parseFloat(match[1]) * scale;
}
