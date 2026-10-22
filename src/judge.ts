import { findCompetitor, type Competitor } from "./competitors.ts";
import type { Item, Signal, SkippedSignal } from "./types.ts";

// Judging is an ordered list of rules. Each rule sees every signal still undecided, all at
// once, and returns judgements for the ones it decides; the rest go on to the next rule. A
// signal no rule decides is skipped as an unknown type.
//
// How later tickets fit: a rule that needs the whole batch, such as merging duplicates (#5),
// goes before the rules it feeds, decides a group of signals in one judgement (an item with
// several source_ids), and leaves the others for the rules after it. A rule that refines an
// existing one, such as source trust (#3), replaces it in RULES. Either way: change RULES,
// add the function, add a case file under cases/.
//
// Signal text is data: it is cleaned and quoted, never read as an instruction.

export type Judgement = { kind: "item"; item: Item } | { kind: "skipped"; skipped: SkippedSignal };
export type Rule = (pending: Signal[]) => Judgement[];

/** A rule that decides signals one at a time. */
function eachSignal(decide: (signal: Signal) => Judgement | undefined): Rule {
  return (pending) => pending.flatMap((signal) => decide(signal) ?? []);
}

const OUTSIDE_MAYAS_JOB = "outside Maya's job: she tracks competitor pricing and packaging";

/** Ad and launch signals are recorded, never turned into items. */
export const outsideMayasJob: Rule = eachSignal((signal) => {
  if (signal.type === "ad") return skip(signal, `ad signal, ${OUTSIDE_MAYAS_JOB}, not ads`);
  if (signal.type === "launch") return skip(signal, `launch signal, ${OUTSIDE_MAYAS_JOB}, not product launches`);
  return undefined;
});

/** A pricing signal becomes a basic item, but only for a competitor whose own page we know. */
export const pricing: Rule = eachSignal((signal) => {
  if (signal.type !== "pricing") return undefined;
  const competitor = findCompetitor(signal.competitor);
  if (!competitor) return skip(signal, "pricing signal, but there is no official page for this competitor");
  return { kind: "item", item: pricingItem(signal, competitor) };
});

export const RULES: Rule[] = [outsideMayasJob, pricing];

/** Runs the rules in order. Each signal is decided by the first rule that decides it. */
export function judge(signals: Signal[], rules: Rule[] = RULES): Judgement[] {
  const judgements: Judgement[] = [];
  let pending = signals;
  for (const rule of rules) {
    if (pending.length === 0) break;
    const decided = rule(pending);
    judgements.push(...decided);
    const ids = new Set(decided.flatMap((j) => (j.kind === "item" ? j.item.source_ids : [j.skipped.id])));
    pending = pending.filter((signal) => !ids.has(signal.id));
  }
  for (const signal of pending) {
    judgements.push(
      skip(signal, signal.type === "" ? "signal has no type, so it was not judged" : "unknown signal type, so it was not judged"),
    );
  }
  return judgements;
}

function skip(signal: Signal, reason: string): Judgement {
  return { kind: "skipped", skipped: { id: signal.id, reason } };
}

function pricingItem(signal: Signal, competitor: Competitor): Item {
  const name = competitor.name;
  const source = clean(signal.source) ?? "";
  const link = competitor.pricingPage;
  const whatChanged = clean(signal.text) ?? "";
  const { before, after } = prices(whatChanged);
  const shown = after ? `${name} now shows ${after}` : `${name}'s current price is on its pricing page`;
  const comparison = `Can't compare yet: Brightloop's own-pricing tab is not connected. ${shown}.`;

  if (isOfficialPricingPage(source, competitor)) {
    return {
      id: `pricing-${signal.id}`,
      source_ids: [signal.id],
      confidence: 0.9,
      confidence_label: `confirmed: seen on ${name}'s own pricing page`,
      action: "watch 2 weeks",
      why: `${comparison} Should we respond? Not yet: watch whether the change holds on the next two Monday runs.`,
      cta: `Open ${link} and check the ${name} price before the 11:00 leadership meeting.`,
      competitor: name,
      page: "pricing",
      what_changed: whatChanged,
      before,
      after,
      link,
      notes: `Source: ${source}.`,
      brightloop_comparison: comparison,
    };
  }

  return {
    id: `pricing-${signal.id}`,
    source_ids: [signal.id],
    confidence: 0.2,
    confidence_label: `unconfirmed: not seen on ${name}'s own pricing page yet`,
    action: "no action",
    why: `${comparison} Should we respond? No: the claim comes from a third party and ${name}'s own page does not confirm it yet.`,
    cta: `Check ${link} before repeating this claim to leadership.`,
    competitor: name,
    page: "pricing",
    what_changed: whatChanged,
    before,
    after,
    link,
    notes: `Source is not ${name}'s own page: ${source || "no source given"}.`,
    brightloop_comparison: comparison,
  };
}

/**
 * True only when the source is a URL on the competitor's own host (or www. plus it) under
 * /pricing. A source that merely mentions the domain ("reddit.com/r/bolt.new", "a post
 * quoting lovable.dev") is not the official page.
 */
export function isOfficialPricingPage(source: string, competitor: Competitor): boolean {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const onHost = host === competitor.domain || host === `www.${competitor.domain}`;
  const path = url.pathname.toLowerCase();
  return onHost && url.username === "" && (path === "/pricing" || path.startsWith("/pricing/"));
}

/** Before and after prices, only when the text states both ("$25/month (was $20 last week)"). */
function prices(text: string): { before: string | null; after: string | null } {
  const price = /\$\d+(?:\.\d{1,2})?(?:\s*\/\s*[a-z]+)?/gi;
  const was = /\bwas\s+(\$\d+(?:\.\d{1,2})?(?:\s*\/\s*[a-z]+)?)/i.exec(text);
  if (!was) return { before: null, after: null };
  const wasAt = was.index + was[0].length - was[1].length;
  const after = [...text.matchAll(price)].find((match) => match.index !== wasAt);
  return after ? { before: was[1], after: after[0] } : { before: null, after: null };
}

/** Outside text made safe to quote: no HTML comments or tags, one line, bounded length. */
function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text === "") return undefined;
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}
