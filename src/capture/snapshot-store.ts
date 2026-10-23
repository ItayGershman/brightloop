import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot, WatchedPage } from "../domain/types.ts";

// Snapshots on disk, committed to the repo: snapshots/<competitor>/<page>/<captured at>.json.
// File names sort by capture time, so the latest snapshot of a page is the last name.

/** Characters a capture time may not keep in a file name (colons, for other systems). */
const UNSAFE_IN_FILE_NAME = /[^0-9A-Za-z.-]/g;

function pageDir(root: string, page: WatchedPage): string {
  return join(root, page.competitor.toLowerCase(), page.page);
}

/** The latest stored snapshot of the page, or undefined if it has none. */
export function latestSnapshot(root: string, page: WatchedPage): Snapshot | undefined {
  const dir = pageDir(root, page);
  if (!existsSync(dir)) return undefined;
  const latest = readdirSync(dir).filter((name) => name.endsWith(".json")).sort().at(-1);
  return latest ? (JSON.parse(readFileSync(join(dir, latest), "utf8")) as Snapshot) : undefined;
}

/** Stores the snapshot, one line of page text per line of the file so diffs stay readable. */
export function writeSnapshot(root: string, snapshot: Snapshot): string {
  const dir = pageDir(root, snapshot);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${snapshot.captured_at.replace(UNSAFE_IN_FILE_NAME, "-")}.json`);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}
