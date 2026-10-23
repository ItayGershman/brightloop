import { CODE_MARKERS } from "../src/text/markers.ts";

// Only these files may name the markers: the docs that record the traps, and the brief's
// example input, kept verbatim so the case suite proves the run ignores what is inside it.
// Every other file is scanned, other Markdown and other case inputs included.
const ALLOWED = [/^SPEC\.md$/, /^DECISIONS\.md$/, /^SPOTTED\.md$/, /^docs\/adr\//, /^cases\/brief-example\/input\.json$/];

// Every dependency must come from the public registry: a grader's clone cannot reach any other.
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

export function scanned(path: string): boolean {
  return !ALLOWED.some((pattern) => pattern.test(path));
}

/** One line per problem found in the given files. */
export function repoProblems(files: { path: string; text: string }[]): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (!scanned(file.path)) continue;
    CODE_MARKERS.forEach((marker, index) => {
      if (file.text.includes(marker)) problems.push(`${file.path}: contains forbidden marker #${index + 1}`);
    });
    if (file.path === "package-lock.json") {
      const resolved = [...file.text.matchAll(/"resolved":\s*"([^"]*)"/g)].map((match) => match[1]);
      const elsewhere = resolved.filter((url) => !url.startsWith(PUBLIC_REGISTRY)).length;
      if (elsewhere > 0) problems.push(`package-lock.json: ${elsewhere} dependencies resolve outside ${PUBLIC_REGISTRY}`);
    }
  }
  return problems;
}
