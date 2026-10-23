import { findCompetitor } from "../config/competitors.ts";
import type { Item, Signal } from "../domain/types.ts";
import { PLAN_NAME } from "../text/patterns.ts";
import { priceChange } from "../text/price-change.ts";
import { quotable } from "../text/quotable.ts";
import { runRules, type Judgement, type Rule } from "./run-rules.ts";

// Duplicates: signals from different sources about the same competitor and event, at the same
// moment once their times are in UTC, are one story. They are judged once, so Maya gets one
// item listing every source id, or each is skipped with the same reason and the ids it goes with.
//
// Same event means same competitor, same signal type and the same UTC moment, from different
// sources. One source reporting two things at once (a pricing page with two changed tiers) is
// two events. Two pricing signals are the same change only when each names exactly one plan and
// states a new price, and both name the same plan and price: a signal that leaves either out is
// never merged, so a change it carries (the free plan's credits, an unbacked claim) is never lost
// inside another item.

/**
 * A batch rule: groups the duplicates among the pending signals and judges each group with the
 * rules it feeds. Signals with no duplicate are left for those rules.
 */
export function mergeDuplicates(feeds: Rule[]): Rule {
  return (pending) => duplicateGroups(pending).flatMap((group) => judgeGroup(group, feeds));
}

/** What decides whether a signal can be a duplicate, worked out once per signal. */
interface Fingerprint {
  /** Moment, type, competitor and (for pricing) plan and price: equal keys may be one event. */
  key: string;
  source: string;
}

/** Signals that may be one event, and the sources already in it. */
interface Group {
  members: Signal[];
  sources: Set<string>;
}

/** Groups of two or more signals that report the same event, members in input order. */
function duplicateGroups(signals: Signal[]): Signal[][] {
  const buckets = new Map<string, Group[]>();
  for (const signal of signals) {
    const print = fingerprint(signal);
    if (!print) continue;
    const groups = buckets.get(print.key) ?? [];
    buckets.set(print.key, groups);
    // Within one key only the source can still tell two signals apart.
    const group = groups.find((candidate) => !candidate.sources.has(print.source));
    if (group) {
      group.members.push(signal);
      group.sources.add(print.source);
    } else {
      groups.push({ members: [signal], sources: new Set([print.source]) });
    }
  }
  // A fixed order: by the first signal of each key, then by when each group was opened.
  return [...buckets.values()].flat().filter((group) => group.members.length > 1).map((group) => group.members);
}

/** Undefined for a signal that is never merged: no readable time, no competitor, or a pricing claim without one plan and one new price. */
function fingerprint(signal: Signal): Fingerprint | undefined {
  const competitor = findCompetitor(signal.competitor)?.name ?? (quotable(signal.competitor) ?? "").toLowerCase();
  if (!signal.utc || competitor === "") return undefined;
  const parts = [String(signal.utc.getTime()), signal.type, competitor];
  if (signal.type === "pricing") {
    const change = pricingChange(signal);
    if (!change) return undefined;
    parts.push(change);
  }
  return { key: JSON.stringify(parts), source: (quotable(signal.source) ?? "").toLowerCase() };
}

/** "pro $25/month" when the text names exactly one plan and states a new price; otherwise undefined. */
function pricingChange(signal: Signal): string | undefined {
  const text = quotable(signal.text) ?? "";
  const plans = new Set([...text.matchAll(PLAN_NAME)].map((match) => samePlan(match[0])));
  const after = priceChange(text).after;
  if (plans.size !== 1 || !after) return undefined;
  return `${[...plans][0]} ${after.toLowerCase()}`;
}

/** "Teams" and "team" are one plan. */
function samePlan(name: string): string {
  const plan = name.toLowerCase();
  return plan === "teams" ? "team" : plan;
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
