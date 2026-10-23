import type { Competitor } from "../config/competitors.ts";
import { PRINTABLE_WITHOUT_SPACES, URL_SCHEME } from "../text/patterns.ts";

/**
 * True only when the source is a URL on the competitor's own host (or www. plus it) under the
 * path of its registered pricing page. A source that merely mentions the domain
 * ("reddit.com/r/bolt.new", "a post quoting lovable.dev") is not the official page.
 */
export function isOfficialPricingPage(source: string, competitor: Competitor): boolean {
  const url = sourceUrl(source);
  if (!url || !isOnHost(url, competitor.domain)) return false;
  const pricingPath = new URL(competitor.pricingPage).pathname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return path === pricingPath || path.startsWith(`${pricingPath}/`);
}

/**
 * The source as a URL, with or without its scheme; undefined when it is anything else: words
 * around a URL ("lovable.dev/pricing/ via a newsletter") or a user name before the host.
 */
export function sourceUrl(source: string): URL | undefined {
  if (!PRINTABLE_WITHOUT_SPACES.test(source)) return undefined;
  try {
    const url = new URL(URL_SCHEME.test(source) ? source : `https://${source}`);
    return url.username === "" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** The URL's host is the domain itself or www. plus it. */
function isOnHost(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  return host === domain || host === `www.${domain}`;
}
