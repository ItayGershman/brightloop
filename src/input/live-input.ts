import { AUDIENCE } from "../config/audience.ts";
import { competitorSlug } from "../config/competitors.ts";
import { BASELINE, type RunInput, type Signal, type Snapshot } from "../domain/types.ts";
import { readTimestamp } from "../text/zoned-time.ts";
import { diffSignals } from "./snapshot-diff.ts";

// The second way into a run, beside the cases file: freshly captured snapshots, each with
// the latest earlier snapshot of the same page if there is one. It yields the same run input,
// so the same rules and in-run checks apply. Page text is outside text: carried as data only.

export interface CapturedPage {
  current: Snapshot;
  earlier?: Snapshot;
}

/**
 * One baseline signal per page with no earlier snapshot. A page that has one is compared with
 * it (snapshot-diff.ts); a page whose changes cannot be placed is reported in the errors.
 */
export function liveInput(pages: CapturedPage[], captureErrors: string[]): RunInput {
  const signals: Signal[] = [];
  const errors = [...captureErrors];
  for (const { current, earlier } of pages) {
    if (earlier) {
      const diffed = diffSignals(current, earlier);
      signals.push(...diffed.signals);
      if (diffed.error) errors.push(diffed.error);
      continue;
    }
    signals.push({
      id: `${BASELINE}-${competitorSlug(current.competitor)}-${current.page}`,
      type: BASELINE,
      competitor: current.competitor,
      page: current.page,
      source: current.url,
      ts: current.captured_at,
      utc: readTimestamp(current.captured_at, AUDIENCE.timezone),
      lines: current.lines,
    });
  }
  return { signals, bannedWords: [], secrets: [], timezone: AUDIENCE.timezone, errors };
}
