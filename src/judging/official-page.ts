import type { Competitor } from "../config/competitors.ts";
import { URL_SCHEME } from "../text/patterns.ts";

/**
 * True only when the source is a URL on the competitor's own host (or www. plus it) under the
 * path of its registered pricing page. A source that merely mentions the domain
 * ("reddit.com/r/bolt.new", "a post quoting lovable.dev") is not the official page.
 */
export function isOfficialPricingPage(source: string, competitor: Competitor): boolean {
  const url = parseUrl(URL_SCHEME.test(source) ? source : `https://${source}`);
  if (!url || url.username !== "") return false;
  const host = url.hostname.toLowerCase();
  const onOwnHost = host === competitor.domain || host === `www.${competitor.domain}`;
  const pricingPath = new URL(competitor.pricingPage).pathname.toLowerCase();
  const path = url.pathname.toLowerCase();
  return onOwnHost && (path === pricingPath || path.startsWith(`${pricingPath}/`));
}

function parseUrl(text: string): URL | undefined {
  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}
