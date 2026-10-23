import { findCompetitor } from "../config/competitors.ts";
import type { Item, Signal } from "../domain/types.ts";
import { priceChange } from "../text/price-change.ts";
import { quotable } from "../text/quotable.ts";
import { runRules, type Judgement, type Rule } from "./run-rules.ts";

// Duplicates: signals from different sources about the same competitor and event, at the same
// moment once their times are in UTC, are one story. They are judged once, so Maya gets one
// item listing every source id, or each is skipped with the same reason and the ids it goes with.
//
// Same event means same competitor, same signal type and the same UTC moment, from different
// sources. One source reporting two things at once (a pricing page with two changed tiers) is
// two events, and so are two pricing signals that state different new prices.

/**
 * A batch rule: groups the duplicates among the pending signals and judges each group with the
 * rules it feeds. Signals with no duplicate are left for those rules.
 */
export function mergeDuplicates(feeds: Rule[]): Rule {
  return (pending) => duplicateGroups(pending).flatMap((group) => judgeGroup(group, feeds));
}

/** Groups of two or more signals that report the same event, each in input order. */
function duplicateGroups(signals: Signal[]): Signal[][] {
  const groups: Signal[][] = [];
  for (const signal of signals) {
    if (!signal.utc) continue;
    const group = groups.find((members) => members.every((member) => sameEvent(member, signal)));
    if (group) group.push(signal);
    else groups.push([signal]);
  }
  return groups.filter((group) => group.length > 1);
}

function sameEvent(a: Signal, b: Signal): boolean {
  return (
    a.utc?.getTime() === b.utc?.getTime() &&
    a.type === b.type &&
    competitorKey(a) === competitorKey(b) &&
    sourceKey(a) !== sourceKey(b) &&
    samePriceIfStated(a, b)
  );
}

function competitorKey(signal: Signal): string {
  return findCompetitor(signal.competitor)?.name ?? (quotable(signal.competitor) ?? "").toLowerCase();
}

function sourceKey(signal: Signal): string {
  return (quotable(signal.source) ?? "").toLowerCase();
}

/** Two signals that both state a new price are the same change only if it is the same price. */
function samePriceIfStated(a: Signal, b: Signal): boolean {
  const [afterA, afterB] = [a, b].map((signal) => priceChange(quotable(signal.text) ?? "").after?.toLowerCase());
  return !afterA || !afterB || afterA === afterB;
}

/**
 * Judges each member with the rules it feeds. If any becomes an item, the group is one item:
 * the most confident one, carrying every id. Otherwise each member is skipped for its own
 * reason, naming the signals it was recorded with.
 */
function judgeGroup(group: Signal[], feeds: Rule[]): Judgement[] {
  const ids = group.map((signal) => signal.id);
  const judgements = group.flatMap((signal) => runRules([signal], feeds));
  const items = judgements.flatMap((judgement) => (judgement.kind === "item" ? [judgement.item] : []));
  if (items.length > 0) return [{ kind: "item", item: merged(items, ids) }];

  return judgements.flatMap((judgement) => {
    if (judgement.kind !== "skipped") return [];
    const others = ids.filter((id) => id !== judgement.skipped.id).join(", ");
    return [{ kind: "skipped", skipped: { ...judgement.skipped, reason: `${judgement.skipped.reason}; same event at the same moment as ${others}` } }];
  });
}

function merged(items: Item[], ids: string[]): Item {
  const best = items.reduce((kept, item) => (item.confidence > kept.confidence ? item : kept));
  const others = ids.length - 1;
  const also = `Also reported by ${others} other signal${others === 1 ? "" : "s"} at the same moment.`;
  return { ...best, source_ids: ids, notes: `${best.notes} ${also}` };
}
