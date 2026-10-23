import { readFileSync } from "node:fs";
import type { Snapshot } from "../src/domain/types.ts";
import type { CapturedPage } from "../src/input/live-input.ts";

// Recorded snapshot pairs for replay. The earlier snapshot of each pair is a real one,
// committed under snapshots/; the later one is an edited copy of it, described by a derived
// fixture under tests/fixtures/derived-snapshot-pairs/. The fixture holds only the edits, so
// it cannot drift from the real page it was made from, and an edit whose line is not on that
// page fails loudly instead of silently changing nothing.

export const DERIVED_PAIRS_DIR = "tests/fixtures/derived-snapshot-pairs";

/** One edit to a copy of a real snapshot. A line must appear exactly once, or `nth` says which (1-based). */
export type Edit =
  | { line: string; nth?: number; becomes: string }
  | { remove: string; nth?: number }
  | { after: string; nth?: number; insert: string[] }
  | { from: string; through: string; becomes: string[] };

interface DerivedPage {
  from: string;
  captured_at: string;
  edits: Edit[];
}

interface DerivedPairs {
  derived: string;
  what: string;
  pages: DerivedPage[];
}

export function readSnapshot(path: string): Snapshot {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The pages of a derived fixture: each real snapshot paired with its edited copy. */
export function derivedPairs(name: string): CapturedPage[] {
  const fixture: DerivedPairs = JSON.parse(readFileSync(`${DERIVED_PAIRS_DIR}/${name}.json`, "utf8"));
  if (!fixture.derived) throw new Error(`${name} must say it is a derived fixture`);
  return fixture.pages.map((page) => {
    const earlier = readSnapshot(page.from);
    return { earlier, current: { ...earlier, captured_at: page.captured_at, lines: applyEdits(earlier.lines, page.edits) } };
  });
}

function applyEdits(lines: string[], edits: Edit[]): string[] {
  let edited = [...lines];
  for (const edit of edits) {
    if ("becomes" in edit && "line" in edit) {
      edited.splice(lineAt(edited, edit.line, edit.nth), 1, edit.becomes);
    } else if ("remove" in edit) {
      edited.splice(lineAt(edited, edit.remove, edit.nth), 1);
    } else if ("insert" in edit) {
      edited.splice(lineAt(edited, edit.after, edit.nth) + 1, 0, ...edit.insert);
    } else {
      const start = lineAt(edited, edit.from);
      const end = lineAt(edited, edit.through);
      if (end < start) throw new Error(`"${edit.through}" comes before "${edit.from}"`);
      edited = [...edited.slice(0, start), ...edit.becomes, ...edited.slice(end + 1)];
    }
  }
  return edited;
}

/** Where a line is: the only line with that text, or its nth occurrence. */
function lineAt(lines: string[], text: string, nth?: number): number {
  const at = lines.flatMap((line, index) => (line === text ? [index] : []));
  if (nth === undefined && at.length !== 1) throw new Error(`"${text}" appears ${at.length} times; say which with nth`);
  const index = at[(nth ?? 1) - 1];
  if (index === undefined) throw new Error(`"${text}" has no occurrence ${nth}`);
  return index;
}
