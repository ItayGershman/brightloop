import { AUDIENCE } from "../config/audience.ts";
import { competitorSlug, findCompetitor, type Competitor } from "../config/competitors.ts";
import { BASELINE, type Item, type OwnPricing, type Signal, type Tier } from "../domain/types.ts";
import { isPaidPrice, pricingTiers, shownPrice } from "../text/pricing-tiers.ts";
import { quotable } from "../text/quotable.ts";
import { RESPOND_QUESTION } from "./advice.ts";
import { baselineComparison } from "./comparison.ts";
import { eachSignal, skip, type Rule } from "./run-rules.ts";

// A page seen for the first time. Its pricing page becomes one item stating the competitor's
// current plans, with nothing to respond to; its homepage is copy, recorded and skipped. Page
// text is data: plans are read from it with named patterns, never followed.

/** The action of every baseline item; the Slack line counts these as a first look, not a change. */
export const BASELINE_ACTION = "no action, baseline recorded";
/** Our own capture of the competitor's own page: as sure as a signal gets, short of a person checking. */
const CONFIDENCE = 0.9;

/**
 * Baseline signals from a live capture: one item per competitor, from its pricing page,
 * compared with Brightloop's own pricing when the run has it.
 */
export function baselineRule(own?: OwnPricing): Rule {
  return eachSignal((signal) => {
    if (signal.type !== BASELINE) return undefined;
    const competitor = findCompetitor(signal.competitor);
    if (!competitor) return skip(signal, "baseline recorded, but this competitor is not in the watch");
    if (signal.page === "homepage") return skip(signal, "homepage baseline recorded: homepage copy, no action");
    const lines = pageLines(signal.lines);
    const tiers = pricingTiers(lines);
    if (tiers.length === 0) {
      return skip(signal, "pricing page baseline recorded, but no plans could be read from it: page structure changed, check by hand");
    }
    return { kind: "item", item: baselineItem(signal, competitor, tiers, own) };
  });
}

function baselineItem(signal: Signal, competitor: Competitor, tiers: Tier[], own?: OwnPricing): Item {
  const name = competitor.name;
  const link = competitor.pricingPage;
  const capturedOn = (quotable(signal.ts) ?? "").slice(0, 10) || "this run";
  const lowestPaid = tiers.find((tier) => isPaidPrice(tier.price)) ?? tiers[0];
  const comparison = baselineComparison(name, lowestPaid, own);

  return {
    id: `${BASELINE}-${competitorSlug(name)}`,
    source_ids: [signal.id],
    confidence: CONFIDENCE,
    confidence_label: `confirmed: read from ${name}'s own pricing page on ${capturedOn}`,
    action: BASELINE_ACTION,
    why: `${comparison} ${RESPOND_QUESTION} No: this is the first snapshot of ${name}'s pricing page, so nothing has changed yet; the next run compares against it.`,
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

/** The page's lines, cleaned for quoting; anything that is not a list of strings gives none. */
function pageLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) => quotable(line) ?? []);
}
