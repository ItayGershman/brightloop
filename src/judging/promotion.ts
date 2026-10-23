import {
  DISCOUNT_WORDING,
  EXPIRY_DATE,
  FINE_PRINT,
  FREE_FOREVER,
  INTRODUCTORY_PRICE,
  LIMITED_TIME,
  PERCENTAGE,
  PROMO_URL_PART,
  URL_SCHEME,
} from "../text/patterns.ts";

// Promotion vs list price. A promotion is never reported as a price cut. Markers come from
// the source URL and the signal's text (quoted text only, so nothing hidden in a comment
// counts). A marker that settles it makes the signal a promotion; a marker that only hints
// makes it a possible promotion, and the item names the check still needed.

/** What the rules make of a signal's promotion markers. `markers` names each one found. */
export type Promotion =
  | { kind: "none" }
  | { kind: "promotion"; markers: string[] }
  | { kind: "possible"; markers: string[]; checks: string[] };

/** The parts of a signal a marker is looked for in. */
interface SignalParts {
  text: string;
  source: string;
  /** The signal states a price that went up: a promotion never raises a price. */
  rose: boolean;
}

interface Marker {
  name: string;
  found: (parts: SignalParts) => boolean;
  /** For a marker that only hints: the check that would settle it, on the competitor's page. */
  check?: (link: string) => string;
}

/** Markers that settle it: the signal is a promotion. */
const PROMOTION_MARKERS: Marker[] = [
  { name: "a promo link", found: ({ source }) => hasPromoUrlPart(source) },
  { name: "an expiry date", found: ({ text }) => EXPIRY_DATE.test(text) },
  { name: '"limited time" wording', found: ({ text }) => LIMITED_TIME.test(text) },
  { name: "discount wording", found: ({ text }) => DISCOUNT_WORDING.test(text) },
  { name: "an introductory price", found: ({ text }) => INTRODUCTORY_PRICE.test(text) },
];

/** Markers that only hint: the rules cannot tell, so the item names the check. */
const POSSIBLE_MARKERS: Marker[] = [
  {
    name: "fine print",
    found: ({ text }) => FINE_PRINT.test(text),
    check: (link) => `read the fine print next to the price on ${link}`,
  },
  {
    name: "a percentage",
    found: ({ text, rose }) => !rose && PERCENTAGE.test(text),
    check: (link) => `check on ${link} whether the percentage is a discount on the list price or a new list price`,
  },
  {
    name: '"free forever" wording',
    found: ({ text }) => FREE_FOREVER.test(text),
    check: (link) => `check on ${link} whether the free plan itself changed or "free forever" is promotional wording`,
  },
];

/** The check every possible promotion needs, whatever its markers. */
const LAST_WEEKS_PRICE = "compare with last week's price (the Wayback Machine, or next Monday's run)";

/**
 * The promotion markers in a signal's quoted text and source; `link` is the competitor's own
 * pricing page, `rose` whether the signal states a price that went up.
 */
export function findPromotion(text: string, source: string, link: string, rose: boolean): Promotion {
  const parts = { text, source, rose };
  const settled = PROMOTION_MARKERS.filter((marker) => marker.found(parts));
  if (settled.length > 0) return { kind: "promotion", markers: settled.map((marker) => marker.name) };
  const hints = POSSIBLE_MARKERS.filter((marker) => marker.found(parts));
  if (hints.length === 0) return { kind: "none" };
  return {
    kind: "possible",
    markers: hints.map((marker) => marker.name),
    checks: [...hints.flatMap((marker) => marker.check?.(link) ?? []), LAST_WEEKS_PRICE],
  };
}

/** A path segment or a query parameter (name or value) of the source URL that names a promotion. */
function hasPromoUrlPart(source: string): boolean {
  let url: URL;
  try {
    url = new URL(URL_SCHEME.test(source) ? source : `https://${source}`);
  } catch {
    return false;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const query = [...url.searchParams].flat();
  return [...segments, ...query].some((part) => PROMO_URL_PART.test(part));
}
