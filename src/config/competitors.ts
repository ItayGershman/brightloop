import { URL_SCHEME } from "./patterns.ts";

// The competitors the watch covers, with their own pages: "no link, no number". Adding a
// competitor is one entry in COMPETITORS; the lookup and the official-page check read only
// from it, and the tests loop over every entry.

export interface Competitor {
  name: string;
  /** The competitor's own host, without "www.". */
  domain: string;
  pricingPage: string;
  homepage: string;
  /** Other names a signal may give for it, such as its domain. Matched without case. */
  aliases: string[];
}

export const COMPETITORS: Competitor[] = [
  {
    name: "Lovable",
    domain: "lovable.dev",
    pricingPage: "https://lovable.dev/pricing",
    homepage: "https://lovable.dev/",
    aliases: ["lovable.dev"],
  },
  {
    name: "Replit",
    domain: "replit.com",
    pricingPage: "https://replit.com/pricing",
    homepage: "https://replit.com/",
    aliases: ["replit.com"],
  },
  {
    name: "Bolt",
    domain: "bolt.new",
    pricingPage: "https://bolt.new/pricing",
    homepage: "https://bolt.new/",
    aliases: ["bolt.new"],
  },
];

/** The registered competitor a signal names, by name or alias. */
export function findCompetitor(name: string | undefined): Competitor | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return COMPETITORS.find((competitor) =>
    [competitor.name, ...competitor.aliases].some((known) => known.toLowerCase() === wanted),
  );
}

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
