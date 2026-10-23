// Every regular expression used to read outside text, in one place. Outside text is data
// (ADR-0001): these patterns only find and strip things, they never decide what to do.
// One exception: src/capture/visible-lines.ts runs inside the captured page, which cannot
// import, so its few patterns are named constants in that function.

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

/**
 * The parts of a price line: group 1 the first price, group 2 a second price after it (the
 * first is then the struck-out one), group 3 the period, group 4 what follows a comma
 * ("$20 $18 / month, billed annually").
 */
export const PRICE_LINE_PARTS =
  /^(\$\d[\d,.]*)(?:\s+(\$\d[\d,.]*))?\s*(\/\s*[a-z]+)?\s*(?:,\s*(.+))?$/i;

/** A line or phrase saying how a plan is billed: "Billed annually", "Per member, billed annually". */
export const BILLING_TEXT = /\b(?:billed (?:annually|yearly|monthly)|per (?:member|user|seat))\b/i;

/** A line holding only the period of the price above it: "/month", "/ month". */
export const PRICE_PERIOD_LINE = /^\/\s*[a-z]+$/i;

/** A line holding only a footnote mark, between a price and its period: "*". */
export const FOOTNOTE_MARK_LINE = /^\*+$/;

/**
 * A line only a bot-check or block page shows, not the site itself: Cloudflare's "Just a
 * moment...", "Performing security verification", "Sorry, you have been blocked",
 * "Verify you are human".
 */
export const BOT_CHECK_LINE =
  /^(?:just a moment\.*|performing security verification|sorry, you have been blocked|verify you are human.*|checking your browser.*)$/i;

/** A price above zero: "$18", "$0.50"; not "$0" or "$0.00". */
export const PAID_PRICE = /^\$(?:0*[1-9]|0*\.\d*[1-9])/;

/** A plan name: one to three capitalised words, no digits or symbols ("Free", "Pro", "Teams"). */
export const PLAN_NAME_LINE = /^[A-Z][a-z]+(?: [A-Z][a-z]+){0,2}$/;

/**
 * A usage limit shown with a plan: a number or "Unlimited", up to two more words, then what
 * is counted ("100 monthly credits", "Up to 15 collaborators", "1M tokens/month").
 */
export const PLAN_LIMIT_LINE =
  /^(?:invite )?(?:up to )?(?:\$?\d[\d,.]*[KM]?|unlimited)\s+(?:[\w.]+\s+){0,2}?(?:credits|tokens|projects|hours|collaborators|viewers|domains|agents|users|members|databases|workspaces|seats|messages)\b/i;
