import { CODE_MARKERS } from "../src/markers.ts";

// Markdown is skipped: the decision log, SPOTTED.md and the ADRs name the markers on
// purpose. Case inputs are skipped: they are outside text, kept verbatim so the case suite
// can prove the run ignores instructions inside them. Expected outputs are scanned.
const SKIP = [/\.md$/, /^cases\/[^/]+\/input\.json$/, /^package-lock\.json$/];

export function scanned(path: string): boolean {
  return !SKIP.some((pattern) => pattern.test(path));
}

/** One line per forbidden marker found in a scanned file. */
export function markerHits(files: { path: string; text: string }[]): string[] {
  const hits: string[] = [];
  for (const file of files) {
    if (!scanned(file.path)) continue;
    CODE_MARKERS.forEach((marker, index) => {
      if (file.text.includes(marker)) hits.push(`${file.path}: contains forbidden marker #${index + 1}`);
    });
  }
  return hits;
}
