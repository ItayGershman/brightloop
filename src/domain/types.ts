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
  /** The moment of `ts` in UTC, set when the input is read; absent if `ts` is missing or unreadable. */
  utc?: Date;
  /** Set only for a signal made from a snapshot diff, by a live run or a replay; a cases file cannot set it. */
  diff?: PageDiff;
  [field: string]: unknown;
}

/** What the run is given, from a cases file or from a live capture. */
export interface RunInput {
  signals: Signal[];
  bannedWords: string[];
  /** Secret-like config values (keys, tokens): they must never appear in any output. */
  secrets: string[];
  /** The IANA time zone weeks are counted in, e.g. "Asia/Jerusalem"; "UTC" when the input names none. */
  timezone: string;
  /** Problems found while reading the input; they end up in run.errors. */
  errors: string[];
  /** Brightloop's own prices, from the own-pricing tab at run time; absent means not connected. */
  ownPricing?: OwnPricing;
}

/**
 * Brightloop's own tiers as read from the own-pricing tab of the audience's sheet. Read at
 * run time only: never written into code, tests or committed files, and never into an output.
 */
export type OwnPricing =
  | { state: "not connected" }
  | { state: "unreadable" }
  | { state: "empty" }
  | { state: "read"; tiers: OwnTier[] };

/** One row of the own-pricing tab. */
export interface OwnTier {
  name: string;
  monthlyUsd: number;
}

/** Signal type of a page a live run sees for the first time; the baseline rule judges it. */
export const BASELINE = "baseline";

/** Signal type of a page whose changes since its latest snapshot are copy only. */
export const PAGE_COPY = "copy";

/** Signal type of a page that is exactly as in its latest snapshot. */
export const UNCHANGED = "unchanged";

/** How a changed line of a snapshot diff is classified. */
export type LineKind = "price" | "limit" | "free plan" | "plan name" | "promotion marker" | "copy only";

/** What a snapshot diff found on one page, or on one plan of it. Page text: data only. */
export interface PageDiff {
  /** When the earlier snapshot it was compared with was captured. */
  since: string;
  /** The changed values in the page's words, earlier and current; null when that side shows none. */
  before: string | null;
  after: string | null;
  /** The plan's current price as the page shows it; null outside every plan or for a removed plan. */
  price: string | null;
  /** The classes of the changed lines, each once. */
  kinds: LineKind[];
  /** How many lines changed: removed plus added. */
  changedLines: number;
}

/** Which of a competitor's pages a snapshot is of. */
export type PageKind = "pricing" | "homepage";

/** How each page kind is named in a message. */
export const PAGE_NAMES: Record<PageKind, string> = { pricing: "pricing page", homepage: "homepage" };

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
  /** The ISO week ("2026-W43") the change was seen in, in the input's time zone; null when no time is known. */
  week?: string | null;
  /** Baseline items only: every plan on the pricing page with its price and limits. */
  tiers?: Tier[];
}

export interface SkippedSignal {
  id: string;
  reason: string;
}

/** The run's one Slack line and what happened to it; written with every result from the command line. */
export interface SlackDelivery {
  line: string;
  status: "posted" | "not posted: only a live run posts" | "not posted: no SLACK_WEBHOOK_URL" | "not posted: the post failed";
}

export interface Result {
  built_for: typeof AUDIENCE.builtFor;
  items: Item[];
  skipped: SkippedSignal[];
  run: { started_at: string; cost_usd: number; errors: string[] };
  slack?: SlackDelivery;
}
