import { AUDIENCE } from "../config/audience.ts";
import { competitorSlug, findCompetitor, type Competitor } from "../config/competitors.ts";
import { COPY, UNCHANGED, type LineKind, type PageDiff, type Signal, type Snapshot } from "../domain/types.ts";
import { hasPromotionMarker } from "../judging/promotion.ts";
import { changedLines } from "../text/line-diff.ts";
import {
  BILLING_TEXT,
  CUSTOM_PRICE_LINE,
  DOLLAR_AMOUNT,
  PLAN_LIMIT_LINE,
  PRICE_LINE,
  PRICE_PERIOD_LINE,
  WHITESPACE_RUN,
} from "../text/patterns.ts";
import { isPaidPrice, planSpans, shownPrice, type PlanSpan } from "../text/pricing-tiers.ts";
import { quotable } from "../text/quotable.ts";
import { readTimestamp } from "../text/zoned-time.ts";

// A page compared with its latest earlier snapshot, line by line. Each changed line is
// classified (price, limit, free plan, plan name, promotion marker, copy only) by where it
// sits on the page, and the changes become signals for the same rules as any other: one
// pricing signal per plan that changed, from the competitor's own pricing page, plus one copy
// signal for lines that are copy only. Only the changed lines are read: the promotion wording
// a page already carries never colours a change next to it. Page text is data, quoted only.

/** The order kinds are listed in. */
const LINE_KINDS: LineKind[] = ["price", "limit", "free plan", "plan name", "promotion marker", "copy only"];

/** What a changed line is on a pricing page. "unplaced" is a price or limit outside every plan. */
type Role = "name" | "price" | "limit" | "promotion" | "copy" | "unplaced";

interface ChangedLine {
  role: Role;
  kind: LineKind;
  side: "earlier" | "current";
  text: string;
}

/** One plan as the two snapshots show it: in both, or in one only (added or removed). */
interface PlanPair {
  earlier?: PlanSpan;
  current?: PlanSpan;
}

/** The signals one page gives, or why it gives none. */
export interface PageSignals {
  signals: Signal[];
  /** "page structure changed, check by hand": the changes could not be placed on a plan. */
  error?: string;
}

/** The signals for one page captured again: what changed since the earlier snapshot. */
export function diffSignals(current: Snapshot, earlier: Snapshot): PageSignals {
  const { removed, added } = changedLines(earlier.lines, current.lines);
  const page = { current, since: earlier.captured_at, slug: `${competitorSlug(current.competitor)}-${current.page}` };
  if (removed.length + added.length === 0) return { signals: [pageSignal(page, UNCHANGED, 0)] };

  const competitor = findCompetitor(current.competitor);
  // A homepage is copy whatever it says; so is a page of a competitor the watch does not know.
  if (current.page !== "pricing" || !competitor) {
    return { signals: [pageSignal(page, COPY, removed.length + added.length)] };
  }

  const earlierSpans = planSpans(earlier.lines);
  const currentSpans = planSpans(current.lines);
  if (earlierSpans.length === 0 || currentSpans.length === 0) {
    return { signals: [], error: structureChanged(current, "no plans could be read from it") };
  }
  const pairs = pairPlans(earlierSpans, currentSpans);
  // A plan the reader no longer finds while its name line is still on the page (or a "new"
  // one whose name was there before) was not added or removed: the page around it changed.
  const misread = pairs.some(
    ({ earlier: gone, current: fresh }) =>
      (gone && !fresh && current.lines.includes(gone.tier.name)) || (fresh && !gone && earlier.lines.includes(fresh.tier.name)),
  );
  if (misread) return { signals: [], error: structureChanged(current, "a plan's name is still on the page but its price can no longer be read with it") };
  const byPlan = new Map<PlanPair | undefined, ChangedLine[]>();
  const sides = [
    { side: "earlier", at: removed, lines: earlier.lines, spans: earlierSpans },
    { side: "current", at: added, lines: current.lines, spans: currentSpans },
  ] as const;
  for (const { side, at, lines, spans } of sides) {
    for (const index of at) {
      const span = spans.find((candidate) => index >= candidate.start && index < candidate.end);
      const role = lineRole(lines[index], index, span);
      const pair = span && pairs.find((candidate) => candidate[side] === span);
      const changed = byPlan.get(pair) ?? [];
      byPlan.set(pair, changed);
      changed.push({ role, kind: lineKind(role, span, competitor), side, text: quotable(lines[index]) ?? "" });
    }
  }
  if ([...byPlan.values()].flat().some((line) => line.role === "unplaced")) {
    return { signals: [], error: structureChanged(current, "a changed price or limit sits outside every plan the page shows") };
  }

  const signals: Signal[] = [];
  for (const pair of [...pairs, undefined]) {
    const changed = (byPlan.get(pair) ?? []).filter((line) => line.role !== "copy");
    if (changed.length > 0) signals.push(planSignal(page, competitor, pair, changed));
  }
  const copy = [...byPlan.values()].flat().filter((line) => line.role === "copy").length;
  if (copy > 0) signals.push(pageSignal(page, COPY, copy));
  return { signals };
}

interface PageInfo {
  current: Snapshot;
  since: string;
  slug: string;
}

function baseSignal({ current }: PageInfo): Omit<Signal, "id" | "type"> {
  return {
    competitor: current.competitor,
    page: current.page,
    source: current.url,
    ts: current.captured_at,
    utc: readTimestamp(current.captured_at, AUDIENCE.timezone),
  };
}

/** A whole page with nothing to act on: unchanged, or changed in copy only. */
function pageSignal(page: PageInfo, type: typeof COPY | typeof UNCHANGED, changedLines: number): Signal {
  const kinds: LineKind[] = type === COPY ? ["copy only"] : [];
  const diff: PageDiff = { since: page.since, before: null, after: null, kinds, changedLines };
  return { ...baseSignal(page), id: `${type}-${page.slug}`, type, diff };
}

/** A pricing signal for one plan's changes (or the page's, outside every plan), read only from the changed lines. */
function planSignal(page: PageInfo, competitor: Competitor, pair: PlanPair | undefined, changed: ChangedLine[]): Signal {
  const plan = pair?.current ?? pair?.earlier;
  const free = plan !== undefined && isFreePlan(plan, competitor);
  const subject = !plan ? `${competitor.name}'s pricing page` : free ? `${competitor.name}'s free plan (${plan.tier.name})` : `${competitor.name} ${plan.tier.name}`;
  const roles = new Set(changed.map((line) => line.role));
  const of = (role: Role) => changed.filter((line) => line.role === role);

  const sentences: string[] = [];
  if (pair && (!pair.earlier || !pair.current || roles.has("name"))) sentences.push(nameSentence(competitor.name, pair));
  // A plan added or removed is told by its name alone: its other lines came or went with it.
  if (!pair || (pair.earlier && pair.current)) {
    if (roles.has("price")) sentences.push(priceSentence(subject, pair, of("price")));
    if (roles.has("promotion")) sentences.push(`${subject} on the pricing page: ${quoteChange(of("promotion"))}.`);
    if (roles.has("limit")) sentences.push(`${subject} limits on the pricing page: ${quoteChange(of("limit"))}.`);
  }
  const { before, after } = beforeAndAfter(pair, roles, changed);
  const kinds = LINE_KINDS.filter((kind) => changed.some((line) => line.kind === kind));
  const id = plan ? `change-${page.slug}-${plan.tier.name.toLowerCase().replace(WHITESPACE_RUN, "-")}` : `change-${page.slug}`;
  return {
    ...baseSignal(page),
    id,
    type: "pricing",
    text: sentences.join(" "),
    diff: { since: page.since, before, after, kinds, changedLines: changed.length },
  };
}

function nameSentence(competitor: string, { earlier, current }: PlanPair): string {
  if (earlier && current) return `${competitor} plan "${earlier.tier.name}" is now named "${current.tier.name}" on the pricing page.`;
  if (earlier) return `${competitor}'s pricing page no longer shows the ${earlier.tier.name} plan.`;
  return `${competitor}'s pricing page now shows a new plan, ${current?.tier.name}, at ${current ? shownPrice(current.tier) : ""}.`;
}

function priceSentence(subject: string, pair: PlanPair | undefined, lines: ChangedLine[]): string {
  const earlier = pair?.earlier?.tier;
  const current = pair?.current?.tier;
  if (earlier && current && (earlier.price !== current.price || earlier.period !== current.period)) {
    return `${subject} price on the pricing page changed from ${earlier.price}${earlier.period ?? ""} to ${current.price}${current.period ?? ""}.`;
  }
  return `${subject} price on the pricing page: ${quoteChange(lines)}.`;
}

/** The changed values in the page's words: the plan's price, else its name, else the changed lines. */
function beforeAndAfter(pair: PlanPair | undefined, roles: Set<Role>, changed: ChangedLine[]): Pick<PageDiff, "before" | "after"> {
  const earlier = pair?.earlier?.tier;
  const current = pair?.current?.tier;
  if (pair && (!earlier || !current)) {
    return { before: earlier ? `${earlier.name} ${shownPrice(earlier)}` : null, after: current ? `${current.name} ${shownPrice(current)}` : null };
  }
  if (earlier && current && roles.has("price") && shownPrice(earlier) !== shownPrice(current)) {
    return { before: shownPrice(earlier), after: shownPrice(current) };
  }
  if (earlier && current && roles.has("name")) return { before: earlier.name, after: current.name };
  return { before: joined(changed, "earlier"), after: joined(changed, "current") };
}

function joined(lines: ChangedLine[], side: ChangedLine["side"]): string | null {
  return lines.filter((line) => line.side === side).map((line) => line.text).join("; ") || null;
}

/** '"a" is now "b"', 'no longer shows "a"', or 'now also shows "b"'. */
function quoteChange(lines: ChangedLine[]): string {
  const before = joined(lines, "earlier");
  const after = joined(lines, "current");
  if (before && after) return `"${before}" is now "${after}"`;
  return before ? `no longer shows "${before}"` : `now also shows "${after}"`;
}

/** Where a changed line sits: a plan's name, price or limit, a promotion marker, or copy. */
function lineRole(line: string, index: number, span: PlanSpan | undefined): Role {
  if (span && index === span.start) return "name";
  if (hasPromotionMarker(line)) return "promotion";
  const pricing = PLAN_LIMIT_LINE.test(line) ? "limit" : isPriceLine(line) ? "price" : undefined;
  if (!pricing) return "copy";
  return span ? pricing : "unplaced";
}

function lineKind(role: Role, span: PlanSpan | undefined, competitor: Competitor): LineKind {
  switch (role) {
    case "name":
      return "plan name";
    case "promotion":
      return "promotion marker";
    case "price":
    case "limit":
      return span && isFreePlan(span, competitor) ? "free plan" : role;
    default:
      return "copy only";
  }
}

/** A price, its period, its billing, a stand-in such as "Custom", or any dollar amount. */
function isPriceLine(line: string): boolean {
  return [PRICE_LINE, CUSTOM_PRICE_LINE, PRICE_PERIOD_LINE, BILLING_TEXT, DOLLAR_AMOUNT].some((pattern) => pattern.test(line));
}

function isFreePlan({ tier }: PlanSpan, competitor: Competitor): boolean {
  return competitor.tiers.free.includes(tier.name) || (PRICE_LINE.test(tier.price) && !isPaidPrice(tier.price));
}

/**
 * Plans matched by name. As many plans gone as new ones means they were renamed, in page
 * order; otherwise the gone ones were removed and the new ones added.
 */
function pairPlans(earlier: PlanSpan[], current: PlanSpan[]): PlanPair[] {
  const pairs: PlanPair[] = current.map((span) => ({ current: span, earlier: earlier.find((e) => e.tier.name === span.tier.name) }));
  const gone = earlier.filter((span) => !pairs.some((pair) => pair.earlier === span));
  const fresh = pairs.filter((pair) => !pair.earlier);
  if (gone.length === fresh.length) fresh.forEach((pair, index) => (pair.earlier = gone[index]));
  else pairs.push(...gone.map((span) => ({ earlier: span })));
  return pairs;
}

function structureChanged(current: Snapshot, why: string): string {
  return `${current.url}: page structure changed, check by hand; ${why}, so no change was reported`;
}
