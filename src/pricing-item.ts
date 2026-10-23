import { AUDIENCE } from "./audience.ts";
import { isOfficialPricingPage, type Competitor } from "./competitors.ts";
import { priceChange } from "./price-change.ts";
import { quotable } from "./quotable.ts";
import type { Item, Signal } from "./types.ts";

// One builder for every pricing item. What differs with how far a source can be trusted
// lives in TRUST_LEVELS, one row per level, checked in order. Source trust (#3) adds its
// tiers (known press, guest post) as rows above the catch-all.

/** What a trust level's wording needs: the competitor, its pricing page, the quoted source. */
interface Page {
  name: string;
  link: string;
  source: string;
}

interface TrustLevel {
  /** Which sources this level is for, in words. */
  name: string;
  /** Whether a signal's source earns this level. The last row matches everything. */
  matches: (source: string, competitor: Competitor) => boolean;
  confidence: number;
  label: (page: Page) => string;
  action: string;
  shouldWeRespond: (page: Page) => string;
  cta: (page: Page) => string;
  notes: (page: Page) => string;
}

const TRUST_LEVELS: TrustLevel[] = [
  {
    name: "the competitor's own pricing page",
    matches: isOfficialPricingPage,
    confidence: 0.9,
    label: ({ name }) => `confirmed: seen on ${name}'s own pricing page`,
    action: "watch 2 weeks",
    shouldWeRespond: () => "Not yet: watch whether the change holds on the next two Monday runs.",
    cta: ({ name, link }) => `Open ${link} and check the ${name} price before ${AUDIENCE.deadline}.`,
    notes: ({ source }) => `Source: ${source}.`,
  },
  {
    name: "any other source",
    matches: () => true,
    confidence: 0.2,
    label: ({ name }) => `unconfirmed: not seen on ${name}'s own pricing page yet`,
    action: "no action",
    shouldWeRespond: ({ name }) => `No: the claim comes from a third party and ${name}'s own page does not confirm it yet.`,
    cta: ({ link }) => `Check ${link} before repeating this claim to ${AUDIENCE.reportsTo}.`,
    notes: ({ name, source }) => `Source is not ${name}'s own page: ${source || "no source given"}.`,
  },
];

/** The first trust level whose row matches the source. */
function trustLevel(source: string, competitor: Competitor): TrustLevel {
  const level = TRUST_LEVELS.find((row) => row.matches(source, competitor));
  if (!level) throw new Error("TRUST_LEVELS must end with a row that matches every source");
  return level;
}

/** A pricing item for one signal about a registered competitor. Signal text is quoted, never followed. */
export function pricingItem(signal: Signal, competitor: Competitor): Item {
  const page: Page = { name: competitor.name, link: competitor.pricingPage, source: quotable(signal.source) ?? "" };
  const trust = trustLevel(page.source, competitor);
  const whatChanged = quotable(signal.text) ?? "";
  const { before, after } = priceChange(whatChanged);
  const shown = after ? `${page.name} now shows ${after}` : `${page.name}'s current price is on its pricing page`;
  const comparison = `Can't compare yet: Brightloop's own-pricing tab is not connected. ${shown}.`;

  return {
    id: `pricing-${signal.id}`,
    source_ids: [signal.id],
    confidence: trust.confidence,
    confidence_label: trust.label(page),
    action: trust.action,
    why: `${comparison} Should we respond? ${trust.shouldWeRespond(page)}`,
    cta: trust.cta(page),
    competitor: page.name,
    page: "pricing",
    what_changed: whatChanged,
    before,
    after,
    link: page.link,
    notes: trust.notes(page),
    brightloop_comparison: comparison,
  };
}
