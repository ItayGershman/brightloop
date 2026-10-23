import { CODE_MARKERS } from "../src/text/markers.ts";

// Only these files may name the markers: the docs that record the traps, and the brief's
// example input, kept verbatim so the case suite proves the run ignores what is inside it.
// Every other file is scanned, other Markdown and other case inputs included.
const ALLOWED = [/^SPEC\.md$/, /^DECISIONS\.md$/, /^SPOTTED\.md$/, /^docs\/adr\//, /^cases\/brief-example\/input\.json$/];

// Every dependency must come from the public registry: a grader's clone cannot reach any other.
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

// Brightloop's own prices are read from the own-pricing tab at run time and never committed
// (DECISIONS.md). The real amounts are not known here, so this catches the shape instead: the
// name, up to three words, then a dollar amount or an amount in USD ("<name> Starter $29",
// "<name>'s Pro: $49"). A sentence that names Brightloop and then a competitor's price
// ("no Brightloop price is used. Replit Core shows $25") does not match: no word run crosses
// the full stop. Captured pages and run outputs are left out: they quote competitors' public
// pages, never the own-pricing tab, and a competitor page naming Brightloop next to a price
// must not stop the Monday run from committing.
const OUTSIDE_TEXT = [/^snapshots\//, /^runs\//];
const BRIGHTLOOP_PRICE = /\bBrightloop(?:'s)?(?:\s+[A-Za-z][\w-]*){0,3}\s*(?:[:=(,-]\s*)?(?:\$\s?\d|\d[\d.,]*\s*(?:USD|dollars)\b)/i;

function scanned(path: string): boolean {
  return !ALLOWED.some((pattern) => pattern.test(path));
}

/** One line per problem found in the given files. */
export function repoProblems(files: { path: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (scanned(file.path)) {
      CODE_MARKERS.forEach((marker, index) => {
        if (file.text.includes(marker)) problems.push(`${file.path}: contains forbidden marker #${index + 1}`);
      });
    }
    // The docs that may name the markers are checked too.
    if (!OUTSIDE_TEXT.some((pattern) => pattern.test(file.path)) && BRIGHTLOOP_PRICE.test(file.text)) {
      problems.push(`${file.path}: looks like a Brightloop price; Brightloop's prices are read from the own-pricing tab at run time, never committed`);
    }
    if (file.path === "package-lock.json") {
      const resolved = [...file.text.matchAll(/"resolved":\s*"([^"]*)"/g)].map((match) => match[1]);
      const elsewhere = resolved.filter((url) => !url.startsWith(PUBLIC_REGISTRY)).length;
      if (elsewhere > 0) problems.push(`package-lock.json: ${elsewhere} dependencies resolve outside ${PUBLIC_REGISTRY}`);
    }
  }
  return problems;
}
