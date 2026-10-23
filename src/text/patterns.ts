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

/**
 * Words in a signal's source, or in a source URL's path, that mark a claim as paid for,
 * anonymous or passed on second-hand: "sponsored post", "newsletter", "AI summary",
 * "forwarded", "via", "u/anon", "rumour", and paid-content sections of press sites
 * ("/sponsor/", "/partner-content/", "/brand-studio/", "/brandvoice/", "/paid-post/").
 */
export const SECOND_HAND_SOURCE =
  /\b(?:sponsor(?:ed)?|advertorial|promoted|partner|brand[- ]?studio|brandvoice|paid[- ]post|newsletter|ai[- ](?:summary|generated)|summari[sz]ed|forwarded|fwd|via|anonymous|anon|rumou?r|unverified)\b/i;

/** A guest post: "launchpad.example, guest post". */
export const GUEST_POST_SOURCE = /\bguest[- ]post\b/i;
