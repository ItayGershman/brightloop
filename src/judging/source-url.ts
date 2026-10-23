import { PRINTABLE_WITHOUT_SPACES, URL_SCHEME } from "../text/patterns.ts";

// Reading a signal's source as a URL. Only parsing and host or path comparison live here;
// what a match means for trust is decided in source-trust.ts.

/** A slash at the end of a path. */
const TRAILING_SLASH = /\/$/;

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

/** The host is the domain itself or one of its subdomains ("blog.replit.com" for "replit.com"). */
export function isOnDomainOrSubdomain(host: string, domain: string): boolean {
  const own = host.toLowerCase();
  return own === domain || own.endsWith(`.${domain}`);
}

/** The URL is on the page's host (or www. plus it) and at or below the page's path. */
export function isUnder(url: URL, page: string): boolean {
  const pageUrl = new URL(page);
  if (!isOnHost(url, pageUrl.hostname)) return false;
  const pagePath = pageUrl.pathname.toLowerCase().replace(TRAILING_SLASH, "");
  const path = url.pathname.toLowerCase();
  return pagePath === "" || path === pagePath || path.startsWith(`${pagePath}/`);
}

/** The URL is exactly the page's host root: "https://bolt.new/" for the homepage. */
export function isRootOf(url: URL, page: string): boolean {
  return isOnHost(url, new URL(page).hostname) && (url.pathname === "/" || url.pathname === "");
}

/** The URL's host is the given host itself or www. plus it. */
function isOnHost(url: URL, host: string): boolean {
  const own = url.hostname.toLowerCase();
  return own === host || own === `www.${host}`;
}
