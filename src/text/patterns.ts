import _ from "lodash";

// Every regular expression used to read outside text, in one place. Outside text is data
// (ADR-0001): these patterns only find and strip things, they never decide what to do.
// One exception: src/capture/visible-lines.ts runs inside the captured page, which cannot
// import, so its few patterns are named constants in that function.

/**
 * A dollar price with an optional period: "$25", "$12.50", "$25/month", "$25 / mo",
 * "$200 per year", "$200 a year", "$200 annually", "$200 billed annually".
 */
const PRICE_SOURCE = String.raw`\$\d+(?:\.\d{1,2})?(?:\s*\/\s*[a-z]+|\s+(?:per|a|an|each)\s+(?:year|yr|month|mo)\b|(?:\s+billed)?\s+(?:annually|yearly|monthly)\b)?`;

/** Every price in a text; global, for matchAll. */
export const PRICE = new RegExp(PRICE_SOURCE, "gi");

/** "was $20" and the like; group 1 is the earlier price. */
export const WAS_PRICE = new RegExp(String.raw`\bwas\s+(${PRICE_SOURCE})`, "i");

/** "$25 → $20", "$25 -> $20", "$25 => $20"; group 1 is the earlier price, group 2 the later. */
export const PRICE_ARROW = new RegExp(String.raw`(${PRICE_SOURCE})\s*(?:→|->|=>|⇒)\s*(${PRICE_SOURCE})`, "i");

/** "$20, down from $25", "$30 up from $25"; group 1 is the later price, group 2 the earlier. */
export const PRICE_DOWN_UP_FROM = new RegExp(String.raw`(${PRICE_SOURCE}),?\s+(?:down|up)\s+from\s+(${PRICE_SOURCE})`, "i");

/** "from $25 to $20"; group 1 is the earlier price, group 2 the later. */
export const PRICE_FROM_TO = new RegExp(String.raw`\bfrom\s+(${PRICE_SOURCE})\s+to\s+(${PRICE_SOURCE})`, "i");

/** A price stated per year: "/year", "/yr", "per year", "a year", "annually", "yearly". */
export const YEARLY = /\/\s*(?:year|yr|annum)\b|\b(?:year|yr|annually|yearly)\b/i;

/** A price stated per month: "/month", "/mo", "per month", "monthly". */
export const MONTHLY = /\/\s*(?:month|mo)\b|\b(?:month|mo|monthly)\b/i;

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

/**
 * Words that mark a claim as paid for, anonymous or passed on second-hand, looked for in a
 * source's text, or in a source URL's host and path. Every word it matches, singular and plural:
 * paid: sponsor, sponsored, sponsorship, advertorial, promoted, partner, partnership,
 *   brand studio (brand-studio, brandstudio), brandvoice, paid post (paid-post);
 * second-hand: newsletter, AI summary, AI-generated, summarised (summarized), forwarded, fwd, via;
 * anonymous or unchecked: anonymous, anon ("u/anon"), rumour (rumor), unverified.
 */
export const SECOND_HAND_SOURCE =
  /\b(?:sponsor(?:s|ed|ships?)?|advertorials?|promoted|partners?(?:hips?)?|brand[- ]?studios?|brandvoice|paid[- ]posts?|newsletters?|ai[- ](?:summary|summaries|generated)|summari[sz]ed|forwarded|fwd|via|anonymous|anon|rumou?rs?|unverified)\b/i;

/** A guest post, singular or plural: "launchpad.example, guest post", "/guest-posts/". */
export const GUEST_POST_SOURCE = /\bguest[- ]posts?\b/i;

/**
 * A date and time, "T" or a space between, optional seconds and fraction, then an optional
 * zone: "Z", "UTC", "GMT", "+03:00", "+0300" or "+03". Groups: year, month, day, hour,
 * minute, second, fraction, zone.
 */
export const TIMESTAMP =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?\s*(Z|UTC|GMT|[+-]\d{2}(?::?\d{2})?)?$/i;

/** A zone that names UTC itself. */
export const UTC_NAME = /^(Z|UTC|GMT)$/i;

/** A stated UTC offset: sign, hours, optional minutes. */
export const UTC_OFFSET = /^([+-])(\d{2}):?(\d{2})?$/;

/**
 * A common plan name, as a whole word: what a duplicate check needs to tell "Pro" from
 * "Teams". Global, for matchAll. A plan with any other name is never merged as a duplicate.
 */
export const PLAN_NAME = /\b(free|hobby|starter|basic|core|pro|plus|premium|team|teams|business|enterprise|scale)\b/gi;

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
// Promotion markers (judging/promotion.ts decides what each one means).

/** "limited time", "limited-time". */
export const LIMITED_TIME = /\blimited[- ]time\b/i;

/** A discount stated as one: "30% off", "sale", "discount", "coupon", "promo code", "special offer". */
export const DISCOUNT_WORDING =
  /\d+(?:\.\d+)?\s*%\s*off\b|\b(?:sale|discount(?:ed)?|coupon|promo(?:tional)? (?:code|price|offer)|special offer|launch offer|black friday|cyber monday)\b/i;

const MONTH = String.raw`(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?`;
const WEEKDAY = String.raw`(?:mon|tues|wednes|thurs|fri|satur|sun)day`;
const DATE = String.raw`(?:${MONTH}\s+\d{1,2}\b|\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}|\d{1,2}[/.]\d{1,2}\b|\d{4}-\d{2}-\d{2}|${WEEKDAY}|today|tonight|tomorrow|midnight|the end of)`;

/** An expiry: "ends Oct 31", "until 31 October", "offer expires Sunday", "valid through 11/30". */
export const EXPIRY_DATE = new RegExp(String.raw`\b(?:ends?|ending|expires?|expiring|until|till|through|thru)\s+(?:on\s+)?${DATE}`, "i");

/** An introductory price: "for the first 3 months", "introductory price", "new customers only". */
export const INTRODUCTORY_PRICE =
  /\bfor the first \d+ (?:days?|weeks?|months?|years?)\b|\bintroductory\b|\bnew (?:customers|users|accounts) only\b/i;

/** Fine print next to a price: a lone asterisk (not Markdown bold "**"), "terms apply", "conditions apply". */
export const FINE_PRINT = /(?<!\*)\*(?!\*)|\b(?:terms|conditions|restrictions)(?: and conditions)? apply\b/i;

/** A percentage, whether or not it is stated as a discount: "20% cheaper", "30% off". */
export const PERCENTAGE = /\d+(?:\.\d+)?\s*%/;

/** "free forever": either the free plan itself or promotional wording; the text alone cannot say which. */
export const FREE_FOREVER = /\bfree forever\b/i;

/** A URL path segment or query parameter that names a promotion: "/promo", "?promo=fall", "?coupon=X". */
export const PROMO_URL_PART = /promo|coupon|discount/i;

/** A plan name as a whole word, case included: "Pro" matches "Pro plan", not "pro-rated" or "Promo". */
export function planNamePattern(name: string): RegExp {
  return new RegExp(String.raw`(?<![\w-])${_.escapeRegExp(name)}(?![\w-])`);
}

/** "free plan", "free tier", "free mode" (Replit's name for its free plan). */
export const FREE_PLAN = /\bfree (?:plan|tier|mode)\b/i;
