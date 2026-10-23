// The audience's Google Sheet: its two tabs and their columns, as Maya named them.

/** The tab the run appends one row per item to. */
export const CHANGES_TAB = "changes";

/** The tab Brightloop's own tiers are read from at run time. */
export const OWN_PRICING_TAB = "own pricing";

/** Maya's columns, in her order, then the run's action, why and confidence. */
export const COLUMNS = [
  "date",
  "competitor",
  "page",
  "what changed",
  "before",
  "after",
  "link to the page",
  "notes",
  "action",
  "why",
  "confidence",
] as const;

/** The own-pricing tab's columns the run reads; matched by header name, without case. */
export const OWN_PRICING_COLUMNS = { tier: "tier", monthlyPrice: "monthly price (USD)" } as const;
