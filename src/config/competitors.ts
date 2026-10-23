// The competitors the watch covers, with their own pages: "no link, no number". Adding a
// competitor is one entry in COMPETITORS; the lookup and the trust levels
// (judging/source-trust.ts) read only from it, and the tests loop over every entry.

export interface Competitor {
  name: string;
  /** The competitor's own host, without "www.". */
  domain: string;
  pricingPage: string;
  homepage: string;
  /**
   * Sections of its own site that speak for it, besides the pricing page and the homepage:
   * a source under one of these is the competitor's own word. Any other page on its domain
   * (a user's page, a forum) is not.
   */
  ownSections: string[];
  /** Other names a signal may give for it, such as its domain. Matched without case. */
  aliases: string[];
}

export const COMPETITORS: Competitor[] = [
  {
    name: "Lovable",
    domain: "lovable.dev",
    pricingPage: "https://lovable.dev/pricing",
    homepage: "https://lovable.dev/",
    ownSections: ["https://lovable.dev/blog", "https://lovable.dev/changelog", "https://blog.lovable.dev/"],
    aliases: ["lovable.dev"],
  },
  {
    name: "Replit",
    domain: "replit.com",
    pricingPage: "https://replit.com/pricing",
    homepage: "https://replit.com/",
    ownSections: ["https://replit.com/blog", "https://replit.com/changelog", "https://blog.replit.com/"],
    aliases: ["replit.com"],
  },
  {
    name: "Bolt",
    domain: "bolt.new",
    pricingPage: "https://bolt.new/pricing",
    homepage: "https://bolt.new/",
    ownSections: ["https://bolt.new/blog", "https://bolt.new/changelog", "https://blog.bolt.new/"],
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
