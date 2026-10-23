import type { Competitor } from "../config/competitors.ts";
import type { Item, Signal } from "../domain/types.ts";
import { priceChange } from "../text/price-change.ts";
import { quotable } from "../text/quotable.ts";
import type { Page, ReportableTrust } from "./source-trust.ts";

// One builder for every pricing item. What differs with how far a source can be trusted
// lives in TRUST_LEVELS (source-trust.ts); this file only puts an item together.

/** A pricing item for one signal about a registered competitor. Signal text is quoted, never followed. */
export function pricingItem(signal: Signal, competitor: Competitor, trust: ReportableTrust): Item {
  const page: Page = { name: competitor.name, link: competitor.pricingPage, source: quotable(signal.source) ?? "" };
  const whatChanged = quotable(signal.text) ?? "";
  const { before, after } = priceChange(whatChanged);
  const shown = after ? `${page.name} now shows ${after}` : `${page.name}'s current price is on its pricing page`;
  const comparison = `Can't compare yet: Brightloop's own-pricing tab is not connected. ${shown}.`;

  return {
    id: `pricing-${signal.id}`,
    source_ids: [signal.id],
    confidence: trust.confidence,
    confidence_label: trust.label(page),
    action: trust.item.action,
    why: `${comparison} Should we respond? ${trust.item.shouldWeRespond(page)}`,
    cta: trust.item.cta(page),
    competitor: page.name,
    page: "pricing",
    what_changed: whatChanged,
    before,
    after,
    link: page.link,
    notes: trust.item.notes(page),
    brightloop_comparison: comparison,
  };
}
