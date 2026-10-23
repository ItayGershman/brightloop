import type { Competitor } from "../config/competitors.ts";
import { PRINTABLE_WITHOUT_SPACES, URL_SCHEME } from "../text/patterns.ts";

/**
 * True only when the source is a URL on the competitor's own host (or www. plus it) under the
 * path of its registered pricing page. A source that merely mentions the domain
 * ("reddit.com/r/bolt.new", "a post quoting lovable.dev") is not the official page.
 */
export function isOfficialPricingPage(source: string, competitor: Competitor): boolean {
  const url = sourceUrl(source);
  return url !== undefined && isUnder(url, competitor.pricingPage);
}

/**
 * True when the source is a URL on the competitor's site that speaks for it: its homepage
 * exactly, or a page under one of its registered own sections (blog, changelog).
 */
export function isOwnPage(source: string, competitor: Competitor): boolean {
  const url = sourceUrl(source);
  if (!url) return false;
  const homepage = new URL(competitor.homepage);
  const onHomepage = isOnHost(url, homepage.hostname) && (url.pathname === "/" || url.pathname === "");
  return onHomepage || competitor.ownSections.some((section) => isUnder(url, section));
}

/** True when the source is a URL anywhere on the competitor's domain or its subdomains. */
export function isOnDomain(source: string, competitor: Competitor): boolean {
  const host = sourceUrl(source)?.hostname.toLowerCase();
  return host !== undefined && (host === competitor.domain || host.endsWith(`.${competitor.domain}`));
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

/** A slash at the end of a path. */
const TRAILING_SLASH = /\/$/;

/** The URL is on the page's host (or www. plus it) and at or below the page's path. */
function isUnder(url: URL, page: string): boolean {
  const pageUrl = new URL(page);
  if (!isOnHost(url, pageUrl.hostname)) return false;
  const pagePath = pageUrl.pathname.toLowerCase().replace(TRAILING_SLASH, "");
  const path = url.pathname.toLowerCase();
  return pagePath === "" || path === pagePath || path.startsWith(`${pagePath}/`);
}

/** The URL's host is the given host itself or www. plus it. */
function isOnHost(url: URL, host: string): boolean {
  const own = url.hostname.toLowerCase();
  return own === host || own === `www.${host}`;
}
