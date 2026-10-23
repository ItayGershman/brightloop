import _ from "lodash";
import { competitorSlug, findCompetitor, type Competitor } from "../config/competitors.ts";
import { PAGE_COPY, UNCHANGED, type LineKind, type PageDiff, type Signal, type Snapshot, type Tier } from "../domain/types.ts";
import { hasPromotionMarker } from "../judging/promotion.ts";
import { changedLines } from "../text/line-diff.ts";
import { DOLLAR_AMOUNT, PLAN_LIMIT_LINE, PRICE_LINE, WHITESPACE_RUN } from "../text/patterns.ts";
import { isPaidPrice, planSpans, shownPrice, type PlanSpan } from "../text/pricing-tiers.ts";
import { quotable } from "../text/quotable.ts";
import { snapshotFields } from "./snapshot-fields.ts";

// A page compared with its latest earlier snapshot. Plans are matched by name first, then each
// plan's card is compared line by line with its own earlier card, and the lines outside every
// card with each other, so a card shown in another place is not a change. Each changed line
// is classified (price, limit, free plan, plan name, promotion marker, copy only) by where it
// sits, and the changes become signals for the same rules as any other: one pricing signal per
// plan that changed, from the competitor's own pricing page, plus one copy signal for lines that
// are copy only. Only the changed lines are read: the promotion wording a page already carries
// never colours a change next to it. When a change cannot be placed on a plan, the page gives
// no signal and no number, only "page structure changed, check by hand". Page text is data.

/** The order kinds are listed in. */
const LINE_KINDS: LineKind[] = ["price", "limit", "free plan", "plan name", "promotion marker", "copy only"];

/** A line's class before the free plan is told apart: "free plan" is a price or limit on the free plan. */
type LineClass = Exclude<LineKind, "free plan">;

/** How a changed line inside a plan's card is classified: the first row that matches. */
const CARD_LINES: { kind: LineClass; matches: (line: string, at: number, card: PlanSpan) => boolean }[] = [
  { kind: "plan name", matches: (_line, at, card) => at === card.start },
  { kind: "promotion marker", matches: (line) => hasPromotionMarker(line) },
  { kind: "price", matches: (_line, at, card) => at >= card.priceFrom && at <= card.priceTo },
  // An allowance stated in dollars ("$20 towards more powerful models") is a limit, not the price.
  { kind: "limit", matches: (line) => PLAN_LIMIT_LINE.test(line) || DOLLAR_AMOUNT.test(line) },
  { kind: "copy only", matches: () => true },
];

interface ChangedLine {
  kind: LineClass;
  /** On the free plan's card. */
  free: boolean;
  /** A price or limit outside every card: it cannot be placed on a plan. */
  unplaced?: boolean;
  side: "earlier" | "current";
  text: string;
}

/** One plan as the two snapshots show it: in both (perhaps renamed), or in one only (added or removed). */
interface PlanPair {
  earlier?: PlanSpan;
  current?: PlanSpan;
}

/** The changes of one plan's card, or of the page outside every card (no pair). */
interface PlanChange {
  pair?: PlanPair;
  lines: ChangedLine[];
}

/** The signals one page gives, or why it gives none. */
export interface PageSignals {
  signals: Signal[];
  /** "page structure changed, check by hand": the changes could not be placed on a plan. */
  error?: string;
}

/** The page captured again and what it is compared with. */
interface DiffedPage {
  current: Snapshot;
  since: string;
  slug: string;
}

/** The signals for one page captured again: what changed since the earlier snapshot. */
export function diffSignals(current: Snapshot, earlier: Snapshot): PageSignals {
  const page: DiffedPage = { current, since: earlier.captured_at, slug: `${competitorSlug(current.competitor)}-${current.page}` };
  const { removed, added } = changedLines(earlier.lines, current.lines);
  const changedCount = removed.length + added.length;
  if (changedCount === 0) return { signals: [pageSignal(page, UNCHANGED, 0)] };

  const competitor = findCompetitor(current.competitor);
  // A homepage is copy whatever it says; so is a page of a competitor the watch does not know.
  if (current.page !== "pricing" || !competitor) return { signals: [pageSignal(page, PAGE_COPY, changedCount)] };

  const earlierCards = planCards(earlier.lines);
  const currentCards = planCards(current.lines);
  if (earlierCards.length === 0 || currentCards.length === 0) return structureChanged(current, "no plans could be read from it");
  const pairs = pairPlans(earlierCards, currentCards);
  if (!pairs) return structureChanged(current, "plans were added, removed or renamed together with other changes");
  // A plan the reader no longer finds while its name line is still on the page (or a "new"
  // one whose name was there before) was not added or removed: the page around it changed.
  const planLostButNamed = pairs.some(
    ({ earlier: gone, current: fresh }) =>
      (gone && !fresh && current.lines.includes(gone.tier.name)) || (fresh && !gone && earlier.lines.includes(fresh.tier.name)),
  );
  if (planLostButNamed) return structureChanged(current, "a plan's name is still on the page but its price can no longer be read with it");

  const changes: PlanChange[] = [
    ...pairs.map((pair) => ({ pair, lines: cardChanges(pair, earlier.lines, current.lines, competitor) })),
    { lines: outsideChanges(earlier.lines, earlierCards, current.lines, currentCards) },
  ];
  const all = changes.flatMap((change) => change.lines);
  if (all.some((line) => line.unplaced)) {
    return structureChanged(current, "a changed price or limit sits outside every plan the page shows");
  }
  const blurred = changes.find(({ pair, lines }) => pair?.earlier && pair.current && lines.some((line) => line.kind === "price") && samePrice(pair));
  if (blurred?.pair?.current) {
    return structureChanged(current, `the ${blurred.pair.current.tier.name} plan's price lines changed but its price reads the same`);
  }

  const signals = changes.flatMap((change) => {
    const lines = change.lines.filter((line) => line.kind !== "copy only");
    return lines.length > 0 ? [planSignal(page, competitor, change.pair, lines)] : [];
  });
  // Lines that only moved (a card shown in another place) count as copy too.
  const copy = all.length === 0 ? changedCount : all.filter((line) => line.kind === "copy only").length;
  if (copy > 0) signals.push(pageSignal(page, PAGE_COPY, copy));
  return { signals };
}

/** Each plan with the lines of its card; the last card ends at its last price or limit line, not at the page's end. */
function planCards(lines: string[]): PlanSpan[] {
  const cards = planSpans(lines);
  const last = cards.at(-1);
  if (last) {
    const pricing = _.range(last.start, last.end).filter((at) => PLAN_LIMIT_LINE.test(lines[at]) || DOLLAR_AMOUNT.test(lines[at]));
    last.end = Math.max(last.priceTo, ...pricing) + 1;
  }
  return cards;
}

/**
 * Plans matched by name. Plans that are only gone, or only new, were removed or added. As many
 * gone as new, each in the same place in the lineup with the same price and limits, were
 * renamed; anything else is undefined, because a rename with a new price cannot be told from
 * one plan replacing another.
 */
function pairPlans(earlier: PlanSpan[], current: PlanSpan[]): PlanPair[] | undefined {
  const pairs: PlanPair[] = current.map((span) => ({ current: span, earlier: earlier.find((e) => e.tier.name === span.tier.name) }));
  const gone = earlier.filter((span) => !pairs.some((pair) => pair.earlier === span));
  const fresh = pairs.filter((pair) => !pair.earlier);
  if (gone.length === 0 || fresh.length === 0) return [...pairs, ...gone.map((span) => ({ earlier: span }))];
  const renamed =
    gone.length === fresh.length &&
    fresh.every((pair, index) => {
      const before = gone[index];
      return (
        pair.current !== undefined &&
        earlier.indexOf(before) === current.indexOf(pair.current) &&
        shownPrice(before.tier) === shownPrice(pair.current.tier) &&
        _.isEqual(before.tier.limits, pair.current.tier.limits)
      );
    });
  if (!renamed) return undefined;
  fresh.forEach((pair, index) => (pair.earlier = gone[index]));
  return pairs;
}

/** The changed lines of one plan's card: its earlier card against its current one. */
function cardChanges({ earlier, current }: PlanPair, earlierLines: string[], currentLines: string[], competitor: Competitor): ChangedLine[] {
  const free = isFreePlan((current ?? earlier) as PlanSpan, competitor);
  const before = earlier ? _.range(earlier.start, earlier.end) : [];
  const after = current ? _.range(current.start, current.end) : [];
  const { removed, added } = changedLines(
    before.map((at) => earlierLines[at]),
    after.map((at) => currentLines[at]),
  );
  return [
    ...removed.map((index) => cardLine(earlierLines, before[index], earlier as PlanSpan, free, "earlier")),
    ...added.map((index) => cardLine(currentLines, after[index], current as PlanSpan, free, "current")),
  ];
}

function cardLine(lines: string[], at: number, card: PlanSpan, free: boolean, side: ChangedLine["side"]): ChangedLine {
  const kind = CARD_LINES.find((row) => row.matches(lines[at], at, card))?.kind ?? "copy only";
  return { kind, free, side, text: quotable(lines[at]) ?? "" };
}

/**
 * The changed lines outside every card. Only promotion wording and copy can be placed there;
 * a price or limit there is marked unplaced.
 */
function outsideChanges(earlierLines: string[], earlierCards: PlanSpan[], currentLines: string[], currentCards: PlanSpan[]): ChangedLine[] {
  const before = outsideCards(earlierLines, earlierCards);
  const after = outsideCards(currentLines, currentCards);
  const { removed, added } = changedLines(
    before.map((at) => earlierLines[at]),
    after.map((at) => currentLines[at]),
  );
  const outside = (text: string, side: ChangedLine["side"]): ChangedLine => {
    if (hasPromotionMarker(text)) return { kind: "promotion marker", free: false, side, text: quotable(text) ?? "" };
    const unplaced = PLAN_LIMIT_LINE.test(text) || DOLLAR_AMOUNT.test(text);
    return { kind: "copy only", free: false, unplaced, side, text: quotable(text) ?? "" };
  };
  return [
    ...removed.map((index) => outside(earlierLines[before[index]], "earlier")),
    ...added.map((index) => outside(currentLines[after[index]], "current")),
  ];
}

function outsideCards(lines: string[], cards: PlanSpan[]): number[] {
  return _.range(lines.length).filter((at) => !cards.some((card) => at >= card.start && at < card.end));
}

/** A whole page with nothing to act on: unchanged, or changed in copy only. */
function pageSignal(page: DiffedPage, type: typeof PAGE_COPY | typeof UNCHANGED, changedCount: number): Signal {
  const kinds: LineKind[] = type === PAGE_COPY ? ["copy only"] : [];
  const diff: PageDiff = { since: page.since, before: null, after: null, price: null, kinds, changedLines: changedCount };
  return { ...snapshotFields(page.current), id: `${type}-${page.slug}`, type, diff };
}

/** A pricing signal for one plan's changes (or the page's, outside every card), written only from the changed lines. */
function planSignal(page: DiffedPage, competitor: Competitor, pair: PlanPair | undefined, lines: ChangedLine[]): Signal {
  const plan = pair?.current ?? pair?.earlier;
  const name = competitor.name;
  const subject = !plan ? `${name}'s pricing page` : lines[0].free ? `${name}'s free plan` : `${name} ${plan.tier.name}`;
  const where = plan ? `${subject} on the pricing page` : subject;
  const linesOfKind = (...kinds: LineClass[]) => lines.filter((line) => kinds.includes(line.kind));
  const earlier = pair?.earlier?.tier;
  const current = pair?.current?.tier;

  const sentences: string[] = [];
  if (pair && (!earlier || !current || earlier.name !== current.name)) sentences.push(nameSentence(name, earlier, current));
  // A plan added or removed is told by its name alone: its other lines came or went with it.
  if (!pair || (earlier && current)) {
    if (earlier && current && shownPrice(earlier) !== shownPrice(current)) {
      sentences.push(`${subject} price on the pricing page changed from ${earlier.price}${earlier.period ?? ""} to ${current.price}${current.period ?? ""}.`);
    }
    if (linesOfKind("promotion marker").length > 0) sentences.push(`${where}: ${quoteChange(linesOfKind("promotion marker"))}.`);
    if (linesOfKind("limit").length > 0) sentences.push(`${subject} limits on the pricing page: ${quoteChange(linesOfKind("limit"))}.`);
  }

  const kinds = LINE_KINDS.filter((kind) => lines.some((line) => reportedKind(line) === kind));
  const id = plan ? `change-${page.slug}-${plan.tier.name.toLowerCase().replace(WHITESPACE_RUN, "-")}` : `change-${page.slug}`;
  const diff: PageDiff = {
    since: page.since,
    ...beforeAndAfter(earlier, current, pair !== undefined, lines),
    price: current ? shownPrice(current) : null,
    kinds,
    changedLines: lines.length,
  };
  return { ...snapshotFields(page.current), id, type: "pricing", text: sentences.join(" "), diff };
}

function nameSentence(competitor: string, earlier: Tier | undefined, current: Tier | undefined): string {
  if (earlier && current) return `${competitor} plan "${earlier.name}" is now named "${current.name}" on the pricing page.`;
  if (earlier) return `${competitor}'s pricing page no longer shows the ${earlier.name} plan.`;
  return `${competitor}'s pricing page now shows a new plan, ${current?.name}, at ${current ? shownPrice(current) : ""}.`;
}

/** The changed values in the page's words: a plan added or removed, else its price, else its name, else the changed lines. */
function beforeAndAfter(earlier: Tier | undefined, current: Tier | undefined, onPlan: boolean, lines: ChangedLine[]): Pick<PageDiff, "before" | "after"> {
  if (onPlan && (!earlier || !current)) {
    return { before: earlier ? `${earlier.name} ${shownPrice(earlier)}` : null, after: current ? `${current.name} ${shownPrice(current)}` : null };
  }
  if (earlier && current && shownPrice(earlier) !== shownPrice(current)) return { before: shownPrice(earlier), after: shownPrice(current) };
  if (earlier && current && earlier.name !== current.name) return { before: earlier.name, after: current.name };
  return { before: joined(lines, "earlier"), after: joined(lines, "current") };
}

function samePrice({ earlier, current }: PlanPair): boolean {
  return earlier !== undefined && current !== undefined && shownPrice(earlier.tier) === shownPrice(current.tier);
}

function reportedKind(line: ChangedLine): LineKind {
  return line.free && (line.kind === "price" || line.kind === "limit") ? "free plan" : line.kind;
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

function isFreePlan({ tier }: PlanSpan, competitor: Competitor): boolean {
  return competitor.tiers.free.includes(tier.name) || (PRICE_LINE.test(tier.price) && !isPaidPrice(tier.price));
}

function structureChanged(current: Snapshot, why: string): PageSignals {
  return { signals: [], error: `${current.url}: page structure changed, check by hand; ${why}, so no change was reported` };
}
