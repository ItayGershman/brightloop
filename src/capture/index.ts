import { watchedPages } from "../config/competitors.ts";
import type { RunInput, Snapshot, WatchedPage } from "../domain/types.ts";
import { liveInput, type CapturedPage } from "../input/live-input.ts";
import { diffSignals } from "../input/snapshot-diff.ts";
import { pricingTiers } from "../text/pricing-tiers.ts";
import { capturePages } from "./capture-pages.ts";
import { latestSnapshot, storedSnapshots, writeSnapshot } from "./snapshot-store.ts";

export { storedSnapshots, writeSnapshot } from "./snapshot-store.ts";

// A live capture: every watched page is opened, its snapshot stored, and the run input built
// from the new snapshots and the latest earlier ones. This file is the only import point;
// the other files in capture/ are internal.

export interface CaptureOptions {
  /** Where snapshots are stored and read back: snapshots/ in the repo. */
  snapshotsDir: string;
  /** Run Chrome without a window. Some sites answer a headless browser with a bot check. */
  headless: boolean;
  /** The pages to capture; every watched page by default. */
  pages?: WatchedPage[];
}

/** Captures every watched page and returns the run input. Never throws: problems go to its errors. */
export async function captureLiveInput(options: CaptureOptions): Promise<RunInput> {
  const pages = options.pages ?? watchedPages();
  const earlier = new Map<string, Snapshot | undefined>();
  const unreadable = new Set<string>();
  for (const page of pages) {
    try {
      earlier.set(page.url, latestSnapshot(options.snapshotsDir, page));
    } catch {
      unreadable.add(page.url);
    }
  }

  const captured = await capturePages(pages, { headless: options.headless });
  const errors = [...captured.errors];
  // A pricing page with no plans the run can read has probably been redesigned. Its snapshot
  // is not stored, so the next run tries again instead of comparing against a page it cannot read.
  const snapshots = captured.snapshots.filter((snapshot) => {
    if (snapshot.page !== "pricing" || pricingTiers(snapshot.lines).length > 0) return true;
    errors.push(`${snapshot.url}: page structure changed, check by hand; no plans could be read, so the snapshot was not stored`);
    return false;
  });
  // Nor is one whose changes cannot be placed on a plan: the next run compares against the
  // last snapshot it could read, so the change is not lost behind an unreadable one.
  for (const snapshot of snapshots) {
    const before = earlier.get(snapshot.url);
    if (before && diffSignals(snapshot, before).error) continue;
    try {
      writeSnapshot(options.snapshotsDir, snapshot);
    } catch {
      errors.push(`${snapshot.url}: the snapshot could not be stored`);
    }
  }
  // A page whose latest snapshot cannot be read is not judged: treating it as having none
  // would record a second baseline and hide whatever changed.
  for (const url of unreadable) {
    errors.push(`${url}: the latest stored snapshot could not be read, so this page was not judged`);
  }
  return liveInput(
    snapshots.filter((current) => !unreadable.has(current.url)).map((current) => ({ current, earlier: earlier.get(current.url) })),
    errors,
  );
}

/**
 * A replay: the run input from snapshots already stored, with no browser and no network.
 * Each page's latest snapshot is compared with the one before it; a page with one snapshot
 * replays as its baseline. Never throws: problems go to its errors.
 */
export function replayInput(snapshotsDir: string, pages: WatchedPage[] = watchedPages()): RunInput {
  const errors: string[] = [];
  const replayed: CapturedPage[] = [];
  for (const page of pages) {
    let stored: Snapshot[];
    try {
      stored = storedSnapshots(snapshotsDir, page);
    } catch {
      errors.push(`${page.url}: a stored snapshot could not be read, so this page was not replayed`);
      continue;
    }
    const [earlier, current] = stored.length === 1 ? [undefined, stored[0]] : stored.slice(-2);
    if (current) replayed.push({ current, earlier });
    else errors.push(`${page.url}: no stored snapshot to replay`);
  }
  return liveInput(replayed, errors);
}
