// Which way a limit moved, when a change states no price: "more" when the plan now includes
// more for the same price ("100 monthly credits" is now "150 monthly credits", "10 apps, up
// from 3"), "less" when it includes less ("3 apps, down from 10", "lowered to 100k"). Null when
// the text does not say, so the change is never read as more for the same price by guess.

export type LimitMove = "more" | "less" | null;

const QUOTED_PAIR = /"([^"]*)" is now "([^"]*)"/;
const UP_FROM = /([\d.]+\s*[kKmM]?)\b[^.]*?\bup\s+from\s+([\d.]+\s*[kKmM]?)/i;
const DOWN_FROM = /([\d.]+\s*[kKmM]?)\b[^.]*?\bdown\s+from\s+([\d.]+\s*[kKmM]?)/i;
const FIRST_NUMBER = /([\d.]+)\s*([kKmM])?\b/;

export function limitMove(text: string): LimitMove {
  const quoted = QUOTED_PAIR.exec(text);
  if (quoted) return compare(quoted[1], quoted[2]);
  const up = UP_FROM.exec(text);
  if (up) return compare(up[2], up[1]);
  const down = DOWN_FROM.exec(text);
  if (down) return compare(down[2], down[1]);
  return null;
}

function compare(before: string, after: string): LimitMove {
  const [a, b] = [quantity(before), quantity(after)];
  if (a === null || b === null || a === b) return null;
  return b > a ? "more" : "less";
}

function quantity(text: string): number | null {
  const match = FIRST_NUMBER.exec(text);
  if (!match) return null;
  const scale = { k: 1e3, m: 1e6 }[(match[2] ?? "").toLowerCase()] ?? 1;
  return Number.parseFloat(match[1]) * scale;
}
