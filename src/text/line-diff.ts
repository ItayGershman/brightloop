// Which lines of a page changed between two snapshots: a longest-common-subsequence diff of
// the two line lists. Lines are compared exactly; a line kept in both, in the same order, is
// unchanged. Pages are a few hundred lines, so the plain table is fast enough.

export interface ChangedLines {
  /** Indexes into the earlier lines of the lines that are gone. */
  removed: number[];
  /** Indexes into the current lines of the lines that are new. */
  added: number[];
}

export function changedLines(earlier: string[], current: string[]): ChangedLines {
  // kept[i][j]: how many lines earlier[i..] and current[j..] have in common, in order.
  const kept = Array.from({ length: earlier.length + 1 }, () => new Array<number>(current.length + 1).fill(0));
  for (let i = earlier.length - 1; i >= 0; i -= 1) {
    for (let j = current.length - 1; j >= 0; j -= 1) {
      kept[i][j] = earlier[i] === current[j] ? kept[i + 1][j + 1] + 1 : Math.max(kept[i + 1][j], kept[i][j + 1]);
    }
  }
  const removed: number[] = [];
  const added: number[] = [];
  let i = 0;
  let j = 0;
  while (i < earlier.length && j < current.length) {
    if (earlier[i] === current[j]) {
      i += 1;
      j += 1;
    } else if (kept[i + 1][j] >= kept[i][j + 1]) {
      removed.push(i);
      i += 1;
    } else {
      added.push(j);
      j += 1;
    }
  }
  for (; i < earlier.length; i += 1) removed.push(i);
  for (; j < current.length; j += 1) added.push(j);
  return { removed, added };
}
