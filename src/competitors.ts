// The competitors Maya watches, with their own pricing pages: "no link, no number".

export interface Competitor {
  name: string;
  domain: string;
  pricingPage: string;
}

export const COMPETITORS: Competitor[] = [
  { name: "Lovable", domain: "lovable.dev", pricingPage: "https://lovable.dev/pricing" },
  { name: "Replit", domain: "replit.com", pricingPage: "https://replit.com/pricing" },
  { name: "Bolt", domain: "bolt.new", pricingPage: "https://bolt.new/pricing" },
];

export function findCompetitor(name: string | undefined): Competitor | undefined {
  if (!name) return undefined;
  const wanted = name.trim().toLowerCase();
  return COMPETITORS.find((competitor) => competitor.name.toLowerCase() === wanted);
}
