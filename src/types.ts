// Shapes shared by the run, its sources and its checks. Vocabulary follows CONTEXT.md.

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

/** What the run is given. Only the file source exists so far; the live source comes later. */
export interface Source {
  signals: Signal[];
  bannedWords: string[];
  /** Problems found while reading the source; they end up in run.errors. */
  errors: string[];
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
}

export interface SkippedSignal {
  id: string;
  reason: string;
}

export interface Result {
  built_for: "maya";
  items: Item[];
  skipped: SkippedSignal[];
  run: { started_at: string; cost_usd: number; errors: string[] };
}
