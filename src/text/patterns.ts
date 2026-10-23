// Every regular expression used to read outside text, in one place. Outside text is data
// (ADR-0001): these patterns only find and strip things, they never decide what to do.

/** A dollar price with an optional period: "$25", "$12.50", "$25/month", "$25 / mo". */
const PRICE_SOURCE = String.raw`\$\d+(?:\.\d{1,2})?(?:\s*\/\s*[a-z]+)?`;

/** Every price in a text; global, for matchAll. */
export const PRICE = new RegExp(PRICE_SOURCE, "gi");

/** "was $20" and the like; group 1 is the earlier price. */
export const WAS_PRICE = new RegExp(String.raw`\bwas\s+(${PRICE_SOURCE})`, "i");

/** An HTML comment, or an unclosed one running to the end of the text. */
export const HTML_COMMENT = /<!--[\s\S]*?(-->|$)/g;

/** An HTML tag, opening or closing. */
export const HTML_TAG = /<[^>]*>/g;

/** A run of whitespace, line breaks included. */
export const WHITESPACE_RUN = /\s+/g;

/** A leading http:// or https://. */
export const URL_SCHEME = /^https?:\/\//i;

/** A config key that names a credential: key, token, secret, password. */
export const CREDENTIAL_KEY = /key|token|secret|passw/i;

/** Only printable characters and no whitespace, from start to end. */
export const PRINTABLE_WITHOUT_SPACES = /^[^\s\p{C}]+$/u;

/** A pricing-page line that starts with a price: "$25", "$0", "$20 $18 / month, billed annually". */
export const PRICE_LINE = /^\$\d/;

/** A pricing-page line that stands in for a price on a plan without one: "Custom", "Platform fee". */
export const CUSTOM_PRICE_LINE = /^(?:custom|platform fee)$/i;

/** A line holding only the period of the price above it: "/month", "/ month". */
export const PRICE_PERIOD_LINE = /^\/\s*[a-z]+$/i;

/** A line holding only a footnote mark, between a price and its period: "*". */
export const FOOTNOTE_MARK_LINE = /^\*+$/;

/** A plan name: one to three capitalised words, no digits or symbols ("Free", "Pro", "Teams"). */
export const PLAN_NAME_LINE = /^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/;

/**
 * A usage limit shown with a plan: a number or "Unlimited", up to two more words, then what
 * is counted ("100 monthly credits", "Up to 15 collaborators", "1M tokens/month").
 */
export const PLAN_LIMIT_LINE =
  /^(?:invite )?(?:up to )?(?:\$?\d[\d,.]*[KM]?|unlimited)\s+(?:[\w.]+\s+){0,2}?(?:credits|tokens|projects|hours|collaborators|viewers|domains|agents|users|members|databases|workspaces|seats|messages)\b/i;
