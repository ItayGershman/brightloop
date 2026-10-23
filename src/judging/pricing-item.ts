import { AUDIENCE } from "../config/audience.ts";
import type { Competitor } from "../config/competitors.ts";
import type { Item, Signal } from "../domain/types.ts";
import { quotable } from "../text/quotable.ts";
import { listPriceChange, readChange } from "./change.ts";
import { compareWithBrightloop } from "./comparison.ts";
import type { Promotion } from "./promotion.ts";
import type { Page, ReportableTrust } from "./source-trust.ts";

// One builder for every pricing item. What differs with how far a source can be trusted
// lives in TRUST_LEVELS (source-trust.ts); what the signal says changed is read once
// (change.ts); this file only puts an item together.

/** A pricing item for one signal about a registered competitor. Signal text is quoted, never followed. */
export function pricingItem(signal: Signal, competitor: Competitor, trust: ReportableTrust): Item {
  const page: Page = { name: competitor.name, link: competitor.pricingPage, source: quotable(signal.source) ?? "" };
  const whatChanged = quotable(signal.text) ?? "";
  const change = readChange(whatChanged, page.source, competitor);
  // A promotion, or a possible one, is never reported as a list-price change.
  const { before, after } = listPriceChange(change);
  const { comparison, stillCheaper } = compareWithBrightloop(change);
  const advice = trust.item.respond(page, change);
  const possible = change.promotion.kind === "possible" ? change.promotion : undefined;

  return {
    id: `pricing-${signal.id}`,
    source_ids: [signal.id],
    confidence: trust.confidence,
    confidence_label: possible ? `unconfirmed, possible promo: the source is ${trust.name}` : trust.label(page),
    action: advice.action,
    why: `${stillCheaper} Should we respond? ${advice.shouldWeRespond}`,
    cta: possible
      ? `Check still needed before ${AUDIENCE.deadline}: ${possible.checks.join("; ")}. Until then, tell ${AUDIENCE.reportsTo} "I'm checking".`
      : trust.item.cta(page),
    competitor: page.name,
    page: "pricing",
    what_changed: whatChanged,
    before,
    after,
    link: page.link,
    notes: [trust.item.notes(page), promotionNote(change.promotion)].filter(Boolean).join(" "),
    brightloop_comparison: comparison,
  };
}

/** What the notes say about promotion markers; empty when there are none. */
function promotionNote(promotion: Promotion): string {
  if (promotion.kind === "promotion") return `Promotion (${promotion.markers.join(", ")}): not a list-price change.`;
  if (promotion.kind === "possible") {
    return `Unconfirmed, possible promo (${promotion.markers.join(", ")}): not reported as a list-price change until checked.`;
  }
  return "";
}
