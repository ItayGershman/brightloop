import { findCompetitor } from "../config/competitors.ts";
import type { Item, Signal } from "../domain/types.ts";
import { PLAN_NAME, PRICE } from "../text/patterns.ts";
import { priceChange } from "../text/price-change.ts";
import { quotable } from "../text/quotable.ts";
import { runRules, type Judgement, type Rule } from "./run-rules.ts";

// Duplicates: signals about the same competitor and the same change, at the same moment once
// their times are in UTC, are one story. They are judged once, so Maya gets one item listing
// every source id, or each is skipped with the same reason and the ids it goes with.
//
// Same story means same competitor, same signal type and the same UTC moment. For a pricing
// signal it also means the same plan and the same new price: each signal must name exactly one
// plan and state one new price, and a signal that leaves either out is never merged, so a change
// it carries (the free plan's credits, an unbacked claim) is never lost inside another item.
// Other signals carry no such detail, so they must also come from different sources: one source
// reporting two launches at once is two stories.

/**
 * Sees every pending signal at once: groups the duplicates and judges each group with the
 * rules it feeds. Signals with no duplicate are left for those rules.
 */
export function mergeDuplicates(feeds: Rule[]): Rule {
  return (pending) => duplicateGroups(pending).flatMap((group) => judgeGroup(group, feeds));
}

/** What decides whether a signal can be a duplicate, worked out once per signal. */
interface Fingerprint {
  /** Moment, type, competitor and (for pricing) plan and price: signals with equal keys may be one story. */
  key: string;
  /** For signals other than pricing, the source, which must differ within a group. */
  source?: string;
}

/** Signals that may be one story, and the sources already in it. */
interface Group {
  members: Signal[];
  sources: Set<string>;
}

/** Groups of two or more signals that report the same story, members in input order. */
function duplicateGroups(signals: Signal[]): Signal[][] {
  const buckets = new Map<string, Group[]>();
  for (const signal of signals) {
    const print = fingerprint(signal);
    if (!print) continue;
    const groups = buckets.get(print.key) ?? [];
    buckets.set(print.key, groups);
    const { source } = print;
    const group = groups.find((candidate) => source === undefined || !candidate.sources.has(source));
    if (group) {
      group.members.push(signal);
      if (source !== undefined) group.sources.add(source);
    } else {
      groups.push({ members: [signal], sources: new Set(source === undefined ? [] : [source]) });
    }
  }
  // A fixed order: by the first signal of each key, then by when each group was opened.
  return [...buckets.values()].flat().filter((group) => group.members.length > 1).map((group) => group.members);
}

/** Undefined for a signal that is never merged: no readable time, no competitor, or a pricing claim without one plan and one new price. */
function fingerprint(signal: Signal): Fingerprint | undefined {
  const competitor = findCompetitor(signal.competitor)?.name ?? lowerQuoted(signal.competitor);
  if (!signal.utc || competitor === "") return undefined;
  const parts = [String(signal.utc.getTime()), signal.type, competitor];
  if (signal.type !== "pricing") return { key: JSON.stringify(parts), source: lowerQuoted(signal.source) };
  const change = planAndPrice(signal);
  return change ? { key: JSON.stringify([...parts, change]) } : undefined;
}

/**
 * "pro $25/month" when the text names exactly one plan and states one new price: the "now" price
 * of a "was" pair, or else the only price in the text. Otherwise undefined.
 */
function planAndPrice(signal: Signal): string | undefined {
  const text = quotable(signal.text) ?? "";
  const plans = new Set([...text.matchAll(PLAN_NAME)].map((match) => planKey(match[0])));
  const prices = [...text.matchAll(PRICE)].map((match) => match[0]);
  const price = priceChange(text).after ?? (prices.length === 1 ? prices[0] : undefined);
  if (plans.size !== 1 || !price) return undefined;
  return `${[...plans][0]} ${price.toLowerCase()}`;
}

/** One key per plan: "Teams" and "team" are the same plan. */
function planKey(name: string): string {
  const plan = name.toLowerCase();
  return plan === "teams" ? "team" : plan;
}

function lowerQuoted(value: unknown): string {
  return (quotable(value) ?? "").toLowerCase();
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
  if (items.length > 0) return [{ kind: "item", item: mergedItem(items, ids) }];

  return judgements.flatMap((judgement) => {
    if (judgement.kind !== "skipped") return [];
    const others = namedIds(ids.filter((id) => id !== judgement.skipped.id));
    return [{ kind: "skipped", skipped: { ...judgement.skipped, reason: `${judgement.skipped.reason}; same story at the same moment as ${others}` } }];
  });
}

/** At most three ids by name, then how many more: a big group must not repeat every id in every reason. */
function namedIds(ids: string[]): string {
  const named = ids.slice(0, 3).join(", ");
  return ids.length > 3 ? `${named} and ${ids.length - 3} more` : named;
}

/** The most confident item, carrying every id of its group. */
function mergedItem(items: Item[], ids: string[]): Item {
  const best = items.reduce((kept, item) => (item.confidence > kept.confidence ? item : kept));
  const others = ids.length - 1;
  const alsoReported = `Also reported by ${others} other signal${others === 1 ? "" : "s"} at the same moment.`;
  return { ...best, source_ids: ids, notes: `${best.notes} ${alsoReported}` };
}
