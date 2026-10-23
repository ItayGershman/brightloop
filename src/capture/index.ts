import { watchedPages } from "../config/competitors.ts";
import type { RunInput, Snapshot, WatchedPage } from "../domain/types.ts";
import { liveInput } from "../input/live-input.ts";
import { capturePages } from "./capture-pages.ts";
import { latestSnapshot, writeSnapshot } from "./snapshot-store.ts";

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

  const { snapshots, errors } = await capturePages(pages, { headless: options.headless });
  for (const snapshot of snapshots) {
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
