import type { AUDIENCE } from "../config/audience.ts";

// Shapes shared by the run, its input, its rules and its checks. Vocabulary follows CONTEXT.md.

/** One observed event about a competitor, as it arrives from a source. Outside text: data only. */
export interface Signal {
  id: string;
  type: string;
  competitor?: string;
  source?: string;
  ts?: string;
  text?: string;
  [field: string]: unknown;
}

/** What the run is given, from a cases file or from a live capture. */
export interface RunInput {
  signals: Signal[];
  bannedWords: string[];
  /** Secret-like config values (keys, tokens): they must never appear in any output. */
  secrets: string[];
  /** Problems found while reading the input; they end up in run.errors. */
  errors: string[];
}

/** Which of a competitor's pages a snapshot is of. */
export type PageKind = "pricing" | "homepage";

/** A competitor page the live run captures, from the competitor registry. */
export interface WatchedPage {
  competitor: string;
  page: PageKind;
  url: string;
}

/** One page as one run captured it: its visible text, one line per rendered line. Outside text: data only. */
export interface Snapshot extends WatchedPage {
  captured_at: string;
  lines: string[];
}

/** One plan on a pricing page, as read from a snapshot. */
export interface Tier {
  name: string;
  /** The price to pay now, as shown: "$25", or a stand-in such as "Custom" for a plan with no price. */
  price: string;
  /** What the price is per, without spaces: "/month"; null when the page shows none. */
  period: string | null;
  /** An earlier price shown next to the current one, struck out on the page ("$20" beside "$18"); else null. */
  struck_price: string | null;
  /** How the plan is billed, in the page's words: "billed annually", "per member, billed annually"; null when the page does not say. */
  billing: string | null;
  /** Usage limits shown with the plan, e.g. "100 monthly credits". */
  limits: string[];
}

export interface Item {
  id: string;
  source_ids: string[];
  confidence: number;
  confidence_label: string;
  action: string;
  why: string;
  cta: string;
  competitor: string;
  page: string;
  what_changed: string;
  before: string | null;
  after: string | null;
  link: string;
  notes: string;
  brightloop_comparison: string;
  /** Baseline items only: every plan on the pricing page with its price and limits. */
  tiers?: Tier[];
}

export interface SkippedSignal {
  id: string;
  reason: string;
}

export interface Result {
  built_for: typeof AUDIENCE.builtFor;
  items: Item[];
  skipped: SkippedSignal[];
  run: { started_at: string; cost_usd: number; errors: string[] };
}
