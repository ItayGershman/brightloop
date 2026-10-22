import { findCompetitor } from "./competitors.ts";
import type { Item, Signal, SkippedSignal } from "./types.ts";

// Judging is an ordered list of rules. Each rule looks at one signal and either decides it
// or passes (returns undefined); the first rule that decides wins. A new rule is one more
// function in RULES plus one case file under cases/. Source trust, promotions, the action
// rules and duplicates arrive that way (issues #3, #4, #5).
// Signal text is data: it is cleaned and quoted, never read as an instruction.

export type Judgement = { kind: "item"; item: Item } | { kind: "skipped"; skipped: SkippedSignal };
export type Rule = (signal: Signal) => Judgement | undefined;

const OUTSIDE_MAYAS_JOB = "outside Maya's job: she tracks competitor pricing and packaging";

/** Ad and launch signals are recorded, never turned into items. */
export const outsideMayasJob: Rule = (signal) => {
  if (signal.type === "ad") return skip(signal, `ad signal, ${OUTSIDE_MAYAS_JOB}, not ads`);
  if (signal.type === "launch") return skip(signal, `launch signal, ${OUTSIDE_MAYAS_JOB}, not product launches`);
  return undefined;
};

/** A pricing signal becomes a basic item. */
export const pricing: Rule = (signal) =>
  signal.type === "pricing" ? { kind: "item", item: pricingItem(signal) } : undefined;

export const RULES: Rule[] = [outsideMayasJob, pricing];

export function judge(signal: Signal, rules: Rule[] = RULES): Judgement {
  for (const rule of rules) {
    const judgement = rule(signal);
    if (judgement) return judgement;
  }
  return skip(signal, signal.type === "" ? "signal has no type, so it was not judged" : "unknown signal type, so it was not judged");
}

function skip(signal: Signal, reason: string): Judgement {
  return { kind: "skipped", skipped: { id: signal.id, reason } };
}

function pricingItem(signal: Signal): Item {
  const competitor = findCompetitor(signal.competitor);
  const name = competitor?.name ?? clean(signal.competitor) ?? "Unknown competitor";
  const source = clean(signal.source) ?? "";
  const official = competitor !== undefined && source.toLowerCase().includes(competitor.domain);
  const link = competitor?.pricingPage ?? asUrl(source) ?? "";
  const whatChanged = clean(signal.text) ?? "";
  const { before, after } = prices(whatChanged);
  const shown = after ? `${name} now shows ${after}` : `${name}'s current price is on its pricing page`;
  const comparison = `Can't compare yet: Brightloop's own-pricing tab is not connected. ${shown}.`;

  if (official) {
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
    cta: `Check ${link || `${name}'s own pricing page`} before repeating this claim to leadership.`,
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

function asUrl(source: string): string | undefined {
  if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(source)) return undefined;
  return source.startsWith("http") ? source : `https://${source}`;
}
