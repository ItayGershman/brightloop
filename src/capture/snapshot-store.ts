import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { competitorSlug } from "../config/competitors.ts";
import type { Snapshot, WatchedPage } from "../domain/types.ts";

// Snapshots on disk, committed to the repo: snapshots/<competitor>/<page>/<captured at>.json.
// File names sort by capture time, so the latest snapshot of a page is the last name.

/** Characters a capture time may not keep in a file name (colons, for other systems). */
const UNSAFE_IN_FILE_NAME = /[^0-9A-Za-z.-]/g;

function pageDir(root: string, page: WatchedPage): string {
  return join(root, competitorSlug(page.competitor), page.page);
}

/** Every stored snapshot of the page, oldest first. Throws on a file that is not a snapshot. */
export function storedSnapshots(root: string, page: WatchedPage): Snapshot[] {
  const dir = pageDir(root, page);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const parsed: unknown = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (!isSnapshotOf(parsed, page)) throw new Error(`${join(dir, name)} is not a snapshot of ${page.url}`);
      return parsed;
    });
}

/** The latest stored snapshot of the page, or undefined if it has none. */
export function latestSnapshot(root: string, page: WatchedPage): Snapshot | undefined {
  return storedSnapshots(root, page).at(-1);
}

/** Stores the snapshot, one line of page text per line of the file so diffs stay readable. */
export function writeSnapshot(root: string, snapshot: Snapshot): string {
  const dir = pageDir(root, snapshot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${snapshot.captured_at.replace(UNSAFE_IN_FILE_NAME, "-")}.json`);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}

/** A file on disk is checked before it is trusted as a snapshot of this page. */
function isSnapshotOf(value: unknown, page: WatchedPage): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    snapshot.competitor === page.competitor &&
    snapshot.page === page.page &&
    typeof snapshot.url === "string" &&
    typeof snapshot.captured_at === "string" &&
    Array.isArray(snapshot.lines) &&
    snapshot.lines.every((line) => typeof line === "string")
  );
}
