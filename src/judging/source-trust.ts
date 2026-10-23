import { AUDIENCE } from "../config/audience.ts";
import type { Competitor } from "../config/competitors.ts";
import { KNOWN_PRESS } from "../config/press.ts";
import { GUEST_POST_SOURCE, SECOND_HAND_SOURCE } from "../text/patterns.ts";
import { quotable } from "../text/quotable.ts";
import { isOnDomainOrSubdomain, isRootOf, isUnder, sourceUrl } from "./source-url.ts";

// How far a signal's source can be trusted: TRUST_LEVELS, one row per level, checked in
// order, and sourceTrust, the one place a source is classified. Confidence starts from the
// spec's source-reliability values. A level with item wording turns a pricing claim into an
// item; a level without it never does by itself: the claim is skipped with the reason until
// the competitor's own pricing page shows it, which the Monday run collects directly.
//
// Only the source decides the level, read as visible text: what a signal's text says about
// itself ("official", "confirmed", a hidden note) changes nothing (ADR-0001).

/** What a trust level's wording needs: the competitor, its pricing page, the quoted source. */
export interface Page {
  name: string;
  link: string;
  source: string;
}

/** How an item from a trust level reads. */
interface ItemWording {
  action: string;
  shouldWeRespond: (page: Page) => string;
  cta: (page: Page) => string;
  notes: (page: Page) => string;
}

interface TrustLevel {
  /** Which sources this level is for, in words. */
  name: string;
  /** Whether a source earns this level. The last row matches everything. */
  matches: (source: string, competitor: Competitor) => boolean;
  confidence: number;
  /** The confidence in plain words, shown next to the number. */
  label: (page: Page) => string;
  /** How a claim from this level is reported; none means it is never an item by itself. */
  item?: ItemWording;
}

export type ReportableTrust = TrustLevel & { item: ItemWording };

const TRUST_LEVELS: TrustLevel[] = [
  // The competitor's own pages come first and only match a bare URL, so a source with words
  // around a URL ("lovable.dev/pricing/ via a newsletter") is never read as the page it
  // mentions, while a word in the competitor's own path ("/blog/new-partner-program") does
  // not make its own page second-hand.
  {
    name: "the competitor's own pricing page",
    matches: (source, competitor) => matchesUrl(source, (url) => isUnder(url, competitor.pricingPage)),
    confidence: 0.9,
    label: ({ name }) => `confirmed: seen on ${name}'s own pricing page`,
    item: {
      action: "watch 2 weeks",
      shouldWeRespond: () => "Not yet: watch whether the change holds on the next two Monday runs.",
      cta: ({ name, link }) => `Open ${link} and check the ${name} price before ${AUDIENCE.deadline}.`,
      notes: ({ source }) => `Source: ${source}.`,
    },
  },
  {
    name: "another page of the competitor's own site",
    matches: (source, competitor) =>
      matchesUrl(source, (url) => isRootOf(url, competitor.homepage) || competitor.ownSections.some((section) => isUnder(url, section))),
    confidence: 0.9,
    label: ({ name }) => `confirmed by ${name}'s own site, not yet seen on its pricing page`,
    item: {
      action: "watch 1 week",
      shouldWeRespond: ({ name }) => `Not yet: ${name} says it, but its pricing page does not show it yet; the next Monday run checks again.`,
      cta: ({ name, link }) => `Open ${link} and check whether the ${name} price matches before ${AUDIENCE.deadline}.`,
      notes: ({ name, source }) => `Source: ${source}, ${name}'s own site but not its pricing page.`,
    },
  },
  // For a URL, the words are read from its host and path, never its query, so a paid
  // subdomain ("sponsored.theverge.com") counts and "?utm_source=newsletter" does not.
  {
    name: "a sponsored, anonymous or second-hand source",
    matches: (source) => SECOND_HAND_SOURCE.test(wordingOf(source)),
    confidence: 0.2,
    label: () => "unconfirmed",
  },
  {
    name: "a guest post",
    matches: (source) => GUEST_POST_SOURCE.test(wordingOf(source)),
    confidence: 0.4,
    label: () => "weak",
  },
  {
    // A user's page or a forum thread on the competitor's domain is someone else talking.
    name: "a user page or forum on the competitor's domain",
    matches: (source, competitor) => matchesUrl(source, (url) => isOnDomainOrSubdomain(url.hostname, competitor.domain)),
    confidence: 0.2,
    label: () => "unconfirmed",
  },
  {
    name: "known press",
    matches: (source) => matchesUrl(source, (url) => KNOWN_PRESS.some((outlet) => isOnDomainOrSubdomain(url.hostname, outlet))),
    confidence: 0.7,
    label: ({ name }) => `likely: reported by known press, not yet seen on ${name}'s own pricing page`,
    item: {
      action: "watch 1 week",
      shouldWeRespond: ({ name }) => `Not yet: a known outlet reports it, but ${name}'s own page does not show it yet; the next Monday run checks.`,
      cta: ({ link }) => `Check ${link} before repeating this to ${AUDIENCE.reportsTo}; until it shows there, it is still being checked.`,
      notes: ({ name, source }) => `Press source, not ${name}'s own page: ${source}.`,
    },
  },
  {
    name: "a source the watch does not know",
    matches: () => true,
    confidence: 0.2,
    label: () => "unconfirmed",
  },
];

/** The trust level of a signal's source: the first row that matches its visible text. */
export function sourceTrust(source: unknown, competitor: Competitor): TrustLevel {
  const visible = quotable(source) ?? "";
  const level = TRUST_LEVELS.find((row) => row.matches(visible, competitor));
  if (!level) throw new Error("TRUST_LEVELS must end with a row that matches every source");
  return level;
}

/** The level turns a pricing claim into an item. */
export function isReportable(level: TrustLevel): level is ReportableTrust {
  return level.item !== undefined;
}

/** Why a claim from a level with no item wording is skipped. Names the level, never quotes the source. */
export function unreportedClaim(level: TrustLevel, competitor: Competitor): string {
  const page: Page = { name: competitor.name, link: competitor.pricingPage, source: "" };
  return (
    `pricing claim from ${level.name}, not reported: ${level.label(page)} (confidence ${level.confidence}) ` +
    `and not seen on ${competitor.name}'s own pricing page. Check ${competitor.pricingPage} before repeating it to ${AUDIENCE.reportsTo}.`
  );
}

/** The words to look at in a source: a URL's host and path, otherwise the whole text. */
function wordingOf(source: string): string {
  const url = sourceUrl(source);
  return url ? `${url.hostname}${url.pathname}` : source;
}

/** The source parses as a URL and the URL passes the test. */
function matchesUrl(source: string, test: (url: URL) => boolean): boolean {
  const url = sourceUrl(source);
  return url !== undefined && test(url);
}
