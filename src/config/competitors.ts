import type { WatchedPage } from "../domain/types.ts";

// The competitors the watch covers, with their own pages: "no link, no number". Adding a
// competitor is one entry in COMPETITORS; the lookup and the official-page check
// (judging/official-page.ts) read only from it, and the tests loop over every entry.

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

/** The pages a live run captures: each competitor's pricing page and homepage. */
export function watchedPages(): WatchedPage[] {
  return COMPETITORS.flatMap((competitor) => [
    { competitor: competitor.name, page: "pricing" as const, url: competitor.pricingPage },
    { competitor: competitor.name, page: "homepage" as const, url: competitor.homepage },
  ]);
}
