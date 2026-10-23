import { AUDIENCE } from "../config/audience.ts";
import { competitorSlug } from "../config/competitors.ts";
import { BASELINE, type RunInput, type Snapshot } from "../domain/types.ts";
import { diffSignals, type PageSignals } from "./snapshot-diff.ts";
import { snapshotFields } from "./snapshot-fields.ts";

// The second way into a run, beside the cases file: freshly captured snapshots, each with
// the latest earlier snapshot of the same page if there is one. It yields the same run input,
// so the same rules and in-run checks apply. Page text is outside text: carried as data only.

export interface CapturedPage {
  current: Snapshot;
  earlier?: Snapshot;
}

export type { PageSignals } from "./snapshot-diff.ts";

/** The run input for these pages; captureErrors are problems found before any page was judged. */
export function liveInput(pages: CapturedPage[], captureErrors: string[]): RunInput {
  return inputFromPages(pages.map(pageSignals), captureErrors);
}

/**
 * A page with no earlier snapshot gives one baseline signal. A page that has one is compared
 * with it (snapshot-diff.ts); a page whose changes cannot be placed gives an error instead.
 */
export function pageSignals({ current, earlier }: CapturedPage): PageSignals {
  if (earlier) return diffSignals(current, earlier);
  const id = `${BASELINE}-${competitorSlug(current.competitor)}-${current.page}`;
  return { signals: [{ ...snapshotFields(current), id, type: BASELINE, lines: current.lines }] };
}

/** The run input from pages already judged into signals, with their errors after captureErrors. */
export function inputFromPages(pages: PageSignals[], captureErrors: string[]): RunInput {
  const errors = [...captureErrors, ...pages.flatMap((page) => page.error ?? [])];
  return { signals: pages.flatMap((page) => page.signals), bannedWords: [], secrets: [], timezone: AUDIENCE.timezone, errors };
}
