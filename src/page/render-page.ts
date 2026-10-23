import { AUDIENCE } from "../config/audience.ts";
import { COMPETITORS } from "../config/competitors.ts";
import { PAGE_NAMES, type Item, type PageKind, type Result } from "../domain/types.ts";
import type { RunLogEntry } from "../schedule/run-log.ts";

// The live page: one static HTML file made from a result and the run log, in Maya's words.
// Pure, so it is the test seam; publishing it is a separate step (publish.ts).
//
// Every value on the page comes from outside text (signals, competitor pages) or from the
// run's own sentences, so all of it is escaped, a link is a link only when it is http or
// https, and the page carries a policy that lets it load and run nothing at all. It shows
// what result.json holds, which never contains a secret or a Brightloop price.

export interface PageView {
  result: Result;
  /** The run log, oldest first, this run included; absent when the run is not a logged one. */
  history?: RunLogEntry[];
  /** The time zone the audience reads times in. */
  timeZone: string;
}

const TITLE = "Competitor pricing watch";
const POLICY = "default-src 'none'; style-src 'unsafe-inline'";

export function renderPage({ result, history, timeZone }: PageView): string {
  const when = (iso: string) => moment(iso, timeZone);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${TITLE}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<header>
<h1>${TITLE}</h1>
<p class="lede">${esc(names(COMPETITORS.map((competitor) => competitor.name)))}: their pricing pages and homepages, checked every Monday morning before ${esc(AUDIENCE.deadline)}, for ${esc(capitalized(AUDIENCE.builtFor))}. Built from public pages only.</p>
<p class="when">Last check: <strong>${esc(when(result.run.started_at))}</strong></p>
</header>
${slackSection(result)}
${itemsSection(result.items)}
${errorsSection(result.run.errors)}
${skippedSection(result)}
${historySection(history, when)}
</main>
</body>
</html>
`;
}

function slackSection(result: Result): string {
  if (!result.slack) return "";
  const { line, status } = result.slack;
  const heading = status === "posted" ? "Posted to #leadership" : `The Slack line (${esc(status)})`;
  return `<section>
<h2>${heading}</h2>
<blockquote>${esc(line)}</blockquote>
</section>`;
}

function itemsSection(items: Item[]): string {
  if (items.length === 0) {
    return `<section>
<h2>This week's changes</h2>
<p>No pricing changes this week.</p>
</section>`;
  }
  return `<section>
<h2>This week's changes (${items.length})</h2>
${items.map(itemBlock).join("\n")}
</section>`;
}

function itemBlock(item: Item): string {
  const page = PAGE_NAMES[item.page as PageKind] ?? item.page;
  const rows: [string, string | null][] = [
    ["Before", item.before],
    ["After", item.after],
    ["Why", item.why],
    ["Against Brightloop", item.brightloop_comparison],
    ["How sure", `${item.confidence_label} (${item.confidence} of 1)`],
    ["Next", item.cta],
    ["Notes", item.notes],
  ];
  return `<article>
<h3>${esc(item.competitor)} · ${esc(page)}: ${esc(item.what_changed)}</h3>
<p class="action">Action: <strong>${esc(item.action)}</strong></p>
<dl>
${rows
  .filter(([, value]) => value)
  .map(([name, value]) => `<dt>${name}</dt><dd>${esc(value ?? "")}</dd>`)
  .join("\n")}
<dt>Link</dt><dd>${link(item.link)}</dd>
</dl>
</article>`;
}

function errorsSection(errors: string[]): string {
  if (errors.length === 0) return "";
  return `<section class="problems">
<h2>Problems in this run (${errors.length})</h2>
<p>Some pages or checks did not go through, so this is not the all-clear.</p>
${errorList(errors)}
</section>`;
}

function skippedSection(result: Result): string {
  if (result.skipped.length === 0) {
    return `<section>
<h2>Skipped signals</h2>
<p>No signals were skipped.</p>
</section>`;
  }
  return `<section>
<h2>Skipped signals (${result.skipped.length})</h2>
<p>Seen, but not reported as a change, with the reason.</p>
<table>
<thead><tr><th>Signal</th><th>Why it was skipped</th></tr></thead>
<tbody>
${result.skipped.map((entry) => `<tr><td>${esc(entry.id)}</td><td>${esc(entry.reason)}</td></tr>`).join("\n")}
</tbody>
</table>
</section>`;
}

function historySection(history: RunLogEntry[] | undefined, when: (iso: string) => string): string {
  if (!history) {
    return `<section>
<h2>Run history: kept by the scheduled and manual runs</h2>
<p>This page was made from a single run, so it has no history.</p>
</section>`;
  }
  const runs = [...history].reverse();
  return `<section>
<h2>Run history (${plural(runs.length, "run")})</h2>
<table>
<thead><tr><th>When</th><th>Pages checked</th><th>Problems</th><th>Slack line</th></tr></thead>
<tbody>
${runs
  .map(
    (entry) => `<tr><td>${esc(when(entry.started_at))}</td><td>${esc(entry.pages_fetched)} of ${esc(plural(entry.pages_watched, "page"))}</td><td>${problems(entry.errors)}</td><td>${slackCell(entry)}</td></tr>`,
  )
  .join("\n")}
</tbody>
</table>
</section>`;
}

function problems(errors: string[]): string {
  if (errors.length === 0) return "none";
  return `${plural(errors.length, "problem")}${errorList(errors)}`;
}

function errorList(errors: string[]): string {
  return `<ul>${errors.map((error) => `<li>${esc(error)}</li>`).join("")}</ul>`;
}

function slackCell(entry: RunLogEntry): string {
  if (entry.slack_line === null) return "no line written";
  return `${esc(entry.slack_status ?? "")}<br><q>${esc(entry.slack_line)}</q>`;
}

function link(url: string): string {
  return isWebLink(url) ? `<a href="${esc(url)}" rel="noopener noreferrer">${esc(url)}</a>` : esc(url);
}

function isWebLink(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** "Monday 26 October 2026, 08:30 Jerusalem time"; the text itself when it is not a time. */
function moment(iso: string, timeZone: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  const place = timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}, ${part("hour")}:${part("minute")} ${place} time`;
}

function capitalized(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** "Lovable, Replit and Bolt". */
function names(list: string[]): string {
  return list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function plural(count: unknown, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Every value on the page goes through here, numbers included: a run log line is read from JSON and may hold anything. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
:root { color-scheme: light dark; --ink: #1d232b; --soft: #59626e; --line: #d9dde3; --card: #f6f7f9; --bg: #ffffff; --warn: #8a4b00; --warn-bg: #fff4e5; --accent: #1f5fbf; }
@media (prefers-color-scheme: dark) { :root { --ink: #e6e9ed; --soft: #a3abb6; --line: #39414b; --card: #20262e; --bg: #15191e; --warn: #ffc27a; --warn-bg: #3a2a14; --accent: #7fb0ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 920px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.8rem; margin: 0 0 8px; }
h2 { font-size: 1.25rem; margin: 32px 0 12px; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 1.05rem; margin: 0 0 8px; }
.lede, .when { color: var(--soft); margin: 4px 0; }
blockquote { margin: 0; padding: 12px 16px; background: var(--card); border-left: 4px solid var(--accent); overflow-wrap: anywhere; }
article { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 16px; margin: 0 0 12px; }
.action { margin: 0 0 8px; }
dl { display: grid; grid-template-columns: 9em 1fr; gap: 4px 12px; margin: 0; }
dt { color: var(--soft); }
dd { margin: 0; overflow-wrap: anywhere; }
a { color: var(--accent); }
.problems { background: var(--warn-bg); color: var(--warn); padding: 4px 16px 12px; border-radius: 8px; }
.problems h2 { border-color: currentColor; }
table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--line); overflow-wrap: anywhere; }
td ul { margin: 4px 0 0; padding-left: 18px; }
@media (max-width: 600px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
`;
