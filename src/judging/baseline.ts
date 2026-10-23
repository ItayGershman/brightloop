import { AUDIENCE } from "../config/audience.ts";
import { findCompetitor, type Competitor } from "../config/competitors.ts";
import type { Item, Signal, Tier } from "../domain/types.ts";
import { BASELINE } from "../input/live-input.ts";
import { pricingTiers } from "../text/pricing-tiers.ts";
import { quotable } from "../text/quotable.ts";
import { eachSignal, skip, type Rule } from "./run-rules.ts";

// A page seen for the first time. Its pricing page becomes one item stating the competitor's
// current plans, with nothing to respond to; its homepage is copy, recorded and skipped. Page
// text is data: plans are read from it with named patterns, never followed.

const ACTION = "no action, baseline recorded";
/** Our own capture of the competitor's own page: as sure as a signal gets, short of a person checking. */
const CONFIDENCE = 0.9;

/** Baseline signals from a live capture: one item per competitor, from its pricing page. */
export const baseline: Rule = eachSignal((signal) => {
  if (signal.type !== BASELINE) return undefined;
  const competitor = findCompetitor(signal.competitor);
  if (!competitor) return skip(signal, "baseline recorded, but this competitor is not in the watch");
  if (signal.page === "homepage") return skip(signal, "homepage baseline recorded: homepage copy, no action");
  const lines = pageLines(signal.lines);
  const tiers = pricingTiers(lines);
  if (tiers.length === 0) {
    return skip(signal, "pricing page baseline recorded, but no plans could be read from it: page structure changed, check by hand");
  }
  return { kind: "item", item: baselineItem(signal, competitor, tiers) };
});

function baselineItem(signal: Signal, competitor: Competitor, tiers: Tier[]): Item {
  const name = competitor.name;
  const link = competitor.pricingPage;
  const capturedOn = (quotable(signal.ts) ?? "").slice(0, 10) || "this run";
  const lowestPaid = tiers.find((tier) => !tier.price.startsWith("$0") && tier.price.startsWith("$")) ?? tiers[0];
  const comparison = `Can't compare yet: Brightloop's own-pricing tab is not connected. ${name}'s lowest paid plan, ${lowestPaid.name}, shows ${shownPrice(lowestPaid)}.`;

  return {
    id: `baseline-${name.toLowerCase()}`,
    source_ids: [signal.id],
    confidence: CONFIDENCE,
    confidence_label: `confirmed: read from ${name}'s own pricing page on ${capturedOn}`,
    action: ACTION,
    why: `${comparison} Should we respond? No: this is the first snapshot of ${name}'s pricing page, so nothing has changed yet; the next run compares against it.`,
    cta: `Use these as ${name}'s current prices when ${AUDIENCE.reportsTo} asks; open ${link} for every plan detail.`,
    competitor: name,
    page: "pricing",
    what_changed: `Baseline recorded: first snapshot of ${name}'s pricing page, no change yet.`,
    before: null,
    after: tiers.map((tier) => `${tier.name} ${shownPrice(tier)}`).join("; "),
    link,
    notes: `Prices as the page shows them by default, with the billing it states, captured ${quotable(signal.ts) ?? "this run"}. Limits: ${tiers
      .map((tier) => `${tier.name}: ${tier.limits.join(", ") || "none shown"}`)
      .join("; ")}.`,
    brightloop_comparison: comparison,
    tiers,
  };
}

/** A plan's price in one phrase: "$18/month, billed annually (struck-out $20)". */
function shownPrice(tier: Tier): string {
  const billing = tier.billing ? `, ${tier.billing}` : "";
  const struck = tier.struck_price ? ` (struck-out ${tier.struck_price})` : "";
  return `${tier.price}${tier.period ?? ""}${billing}${struck}`;
}

/** The page's lines, cleaned for quoting; anything that is not a list of strings gives none. */
function pageLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => quotable(line) ?? []);
}
