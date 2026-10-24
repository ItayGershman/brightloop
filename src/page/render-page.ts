import { AUDIENCE } from "../config/audience.ts";
import { COMPETITORS, competitorSlug, findCompetitor, type Competitor } from "../config/competitors.ts";
import { PAGE_COPY, PAGE_NAMES, UNCHANGED, type Item, type PageKind, type Result, type SlackDelivery, type Tier } from "../domain/types.ts";
import { RESPOND_NOW, RESPOND_QUESTION } from "../judging/advice.ts";
import { BASELINE_ACTION } from "../judging/baseline.ts";
import type { RunLogEntry } from "../schedule/run-log.ts";
import { shownPrice } from "../text/pricing-tiers.ts";
import { ICONS, MARK_SYMBOLS, mark } from "./marks.ts";

// The live page: one static HTML file made from a result and the run log, in Maya's words.
// Pure, so it is the test seam; publishing it is a separate step (publish.ts).
//
// It is read on Monday before the 11:00 meeting, top down: the answer in one sentence, one card
// per competitor, each change with last week beside this week and a button to its source, then
// the Slack line and, folded, what was seen and not counted and the earlier runs. The headline
// is built from counts and actions only, never from outside text, like the Slack line.
//
// Every value on the page comes from outside text (signals, competitor pages) or from the
// run's own sentences, so all of it is escaped, a link is a link only when it is http or
// https, and the page carries a policy that lets it load and run nothing at all: its marks
// and icons are inline SVG. It shows what result.json holds, which never contains a secret
// or a Brightloop price.

export interface PageView {
  result: Result;
  /** The run log, oldest first, this run included; absent when the run is not a logged one. */
  history?: RunLogEntry[];
  /** The time zone the audience reads times in. */
  timeZone: string;
}

const TITLE = "Competitor pricing watch";
const POLICY = "default-src 'none'; style-src 'unsafe-inline'";
const PAGES: PageKind[] = ["pricing", "homepage"];
/** Every link to another site opens in a new tab, so the page stays open; jumps within the page do not. */
const NEW_TAB = `target="_blank" rel="noopener noreferrer"`;

export function renderPage({ result, history, timeZone }: PageView): string {
  const when = (iso: string) => moment(iso, timeZone);
  const short = (iso: string) => shortMoment(iso, timeZone);
  const changes = ordered(result.items.filter((item) => item.action !== BASELINE_ACTION));
  const baselines = result.items.filter((item) => item.action === BASELINE_ACTION);
  const anchors = new Map<Item, string>([...changes.map((item, n) => [item, `change-${n + 1}`] as const), ...baselines.map((item, n) => [item, `first-look-${n + 1}`] as const)]);
  const states = pageStates(result);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${POLICY}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="robots" content="noindex">
<title>${TITLE}</title>
<style>${STYLE}</style>
</head>
<body>
${MARK_SYMBOLS}
<main class="wrap">
<header class="top">
<div><p class="brand">${TITLE}</p>
<p class="when">Last check: ${esc(when(result.run.started_at))}</p></div>
${channelButton(`${ICONS.slack}${esc(AUDIENCE.slackChannel)}${ICONS.out}`)}
</header>
${heroSection(result, changes, baselines, anchors)}
${competitorsSection(result, states, changes, baselines, anchors)}
${errorsSection(result.run.errors)}
${changesSection(changes, anchors, short)}
${baselinesSection(baselines, anchors)}
${slackSection(result)}
${skippedSection(result, short)}
${historySection(history, short)}
<footer class="foot">Checked every Monday morning before ${esc(AUDIENCE.deadline)}, for ${esc(capitalized(AUDIENCE.builtFor))}, from ${esc(names(COMPETITORS.map((competitor) => competitor.name)))}'s public pages only. No Brightloop prices are shown on this page.</footer>
</main>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------
// The answer, first

type Tone = "green" | "red" | "amber" | "grey";

function heroSection(result: Result, changes: Item[], baselines: Item[], anchors: Map<Item, string>): string {
  const respond = changes.filter(isRespondNow);
  const problems = result.run.errors.length;
  const meeting = AUDIENCE.meetingTime;
  const alsoProblems = problems > 0 ? ` The run also hit ${plural(problems, "problem")}, so it may not be everything.` : "";
  let tone: Tone;
  let title: string;
  let sub: string;
  let jump: { item: Item; text: string } | undefined;
  if (respond.length > 0) {
    const others = changes.length - respond.length;
    tone = "red";
    title = `${respond.length === 1 ? "1 change needs" : `${respond.length} changes need`} a response before ${meeting}`;
    sub = `${plural(changes.length, "pricing change")} this week.${others > 0 ? ` ${others === 1 ? "The other one is" : `The other ${others} are`} worth watching, no response yet.` : ""}${alsoProblems}`;
    jump = { item: respond[0], text: respond.length === 1 ? `See the ${respond[0].competitor} change` : "See the changes" };
  } else if (changes.length > 0) {
    tone = "amber";
    title = `${plural(changes.length, "pricing change")} to watch, none needs a response yet`;
    sub = `Each one says what would change that.${alsoProblems}`;
    jump = { item: changes[0], text: "See the changes" };
  } else if (problems > 0) {
    tone = "amber";
    title = `No pricing changes found, but the run hit ${plural(problems, "problem")}`;
    sub = `Don't call it an all-clear yet: what failed is listed below. Check it by hand before ${meeting}.`;
  } else if (baselines.length > 0) {
    tone = "green";
    title = "First look: today's prices are recorded";
    sub = `Nothing has changed yet; the next check compares against these. Nothing to bring to ${meeting}.`;
  } else {
    tone = "green";
    title = "No pricing changes this week";
    sub = `${names(COMPETITORS.map((competitor) => competitor.name))}: no price or plan change found. Nothing to bring to ${meeting}.`;
  }
  const icon = tone === "green" ? ICONS.check : tone === "red" ? ICONS.dot : ICONS.warn;
  const button = jump ? `<a class="btn ${tone === "red" ? "danger" : "primary"}" href="#${anchors.get(jump.item)}">${esc(jump.text)}${ICONS.down}</a>` : "";
  return `<section class="hero ${tone}">
<div class="hero-icon">${icon}</div>
<div class="hero-text">
<h1>${esc(title)}</h1>
<p>${esc(sub)}</p>
${button}
</div>
</section>`;
}

// ---------------------------------------------------------------------------------------------
// One card per competitor: scan it in two seconds

type PageState = "changed" | "first look" | "same" | "copy" | "blocked";

/** What happened to each watched page in this run, as far as the result tells: by "<slug>-<page>". */
function pageStates(result: Result): Map<string, PageState> {
  const states = new Map<string, PageState>();
  const rank: PageState[] = ["same", "copy", "first look", "blocked", "changed"];
  const set = (key: string, state: PageState) => {
    const now = states.get(key);
    if (!now || rank.indexOf(state) > rank.indexOf(now)) states.set(key, state);
  };
  for (const competitor of COMPETITORS) {
    const slug = competitorSlug(competitor.name);
    for (const page of PAGES) {
      const key = `${slug}-${page}`;
      // Ids of a snapshot diff's page signals (input/snapshot-diff.ts) and the capture's error lines (capture/capture-pages.ts).
      if (result.skipped.some((entry) => entry.id === `${UNCHANGED}-${key}`)) set(key, "same");
      if (result.skipped.some((entry) => entry.id === `${PAGE_COPY}-${key}`)) set(key, "copy");
      if (result.run.errors.some((error) => error.startsWith(`${competitor.name} ${PAGE_NAMES[page]}:`))) set(key, "blocked");
    }
  }
  for (const item of result.items) {
    const competitor = findCompetitor(item.competitor);
    if (!competitor) continue;
    set(`${competitorSlug(competitor.name)}-${pageKind(item.page)}`, item.action === BASELINE_ACTION ? "first look" : "changed");
  }
  return states;
}

const PAGE_STATE_WORDS: Record<PageState, [string, "ok" | "red" | "amber"]> = {
  changed: ["Price or plan changed", "red"],
  "first look": ["First look recorded", "ok"],
  same: ["Same as last check", "ok"],
  copy: ["Wording only, no price change", "ok"],
  blocked: ["Couldn't load it", "amber"],
};

function competitorsSection(result: Result, states: Map<string, PageState>, changes: Item[], baselines: Item[], anchors: Map<Item, string>): string {
  const cards = COMPETITORS.map((competitor) => {
    const slug = competitorSlug(competitor.name);
    const own = (items: Item[]) => items.filter((item) => findCompetitor(item.competitor) === competitor);
    const mine = own(changes);
    const known = PAGES.filter((page) => states.has(`${slug}-${page}`));
    let status: string;
    if (mine.length > 0) {
      const lead = mine[0];
      status = pill(actionTone(lead.action), `${plural(mine.length, "change")} · ${lead.action}`, `#${anchors.get(lead)}`, ICONS.down);
    } else if (known.some((page) => states.get(`${slug}-${page}`) === "blocked")) {
      status = pill("amber", "Couldn't check everything", "#problems", ICONS.down);
    } else if (own(baselines).length > 0) {
      status = pill("green", "First look recorded", `#${anchors.get(own(baselines)[0])}`, ICONS.down);
    } else if (known.length > 0 || result.run.errors.length === 0) {
      status = pill("green", "No change", undefined, ICONS.check);
    } else {
      status = pill("grey", "Not checked in this run");
    }
    const rows = known
      .map((page) => {
        const [words, tone] = PAGE_STATE_WORDS[states.get(`${slug}-${page}`) as PageState];
        const icon = tone === "ok" ? ICONS.check : tone === "red" ? ICONS.dot : ICONS.warn;
        return `<li><a href="${esc(pageUrl(competitor, page))}" ${NEW_TAB}>${esc(capitalized(PAGE_NAMES[page]))}</a><span class="state ${tone}">${icon}${esc(words)}</span></li>`;
      })
      .join("");
    return `<div class="comp">
<div class="comp-top">${mark(slug, 28)}<p class="name">${esc(competitor.name)}</p></div>
${status}
${rows ? `<ul class="pages">${rows}</ul>` : ""}
</div>`;
  });
  return `<section class="comps" aria-label="Each competitor in this run">
${cards.join("\n")}
</section>`;
}

function pill(tone: Tone, words: string, href?: string, icon = ""): string {
  return href
    ? `<a class="pill ${tone}" href="${href}">${esc(words)}${icon}</a>`
    : `<span class="pill ${tone}">${icon}${esc(words)}</span>`;
}

// ---------------------------------------------------------------------------------------------
// What went wrong

function errorsSection(errors: string[]): string {
  if (errors.length === 0) return "";
  return `<section class="problems" id="problems">
<h2>${ICONS.warn}Problems in this run (${errors.length})</h2>
<p class="lede">Some pages or checks did not go through, so this is not the all-clear.</p>
<ul>${errors.map((error) => `<li><p>${esc(error)}</p>${failedPageButton(error)}</li>`).join("")}</ul>
</section>`;
}

/** A button to the watched page an error names, so Maya can check it by hand. */
function failedPageButton(error: string): string {
  for (const competitor of COMPETITORS) {
    for (const page of PAGES) {
      if (error.startsWith(`${competitor.name} ${PAGE_NAMES[page]}:`)) {
        return `<a class="btn" href="${esc(pageUrl(competitor, page))}" ${NEW_TAB}>Open ${esc(competitor.name)}'s ${esc(PAGE_NAMES[page])}${ICONS.out}</a>`;
      }
    }
  }
  return "";
}

// ---------------------------------------------------------------------------------------------
// One card per change: what changed, last week beside this week, the answers, the proof

function changesSection(changes: Item[], anchors: Map<Item, string>, short: (iso: string) => string): string {
  if (changes.length === 0) return "";
  return `<section class="changes">
<h2>This week's changes (${changes.length})</h2>
${changes.map((item) => changeCard(item, anchors.get(item) ?? "", short)).join("\n")}
</section>`;
}

function changeCard(item: Item, anchor: string, short: (iso: string) => string): string {
  const tone = actionTone(item.action);
  const { cheaper, respond } = answers(item);
  const compared = item.before || item.after
    ? `<div class="ba">
<div class="side before"><p class="k">Last week</p><p class="v">${esc(item.before ?? "not shown")}</p></div>
<div class="to">${ICONS.arrow}</div>
<div class="side after"><p class="k">This week</p><p class="v">${esc(item.after ?? "not shown")}</p></div>
</div>`
    : "";
  return `<article class="change ${tone}" id="${anchor}">
${cardTop(item, `<span class="badge ${tone}">${esc(capitalized(item.action))}</span>`)}
<h3>${esc(item.what_changed)}</h3>
${compared}
<dl class="facts">
<div><dt>${esc(RESPOND_QUESTION)}</dt><dd>${esc(respond)}</dd></div>
<div><dt>${esc(cheaper.question)}</dt><dd>${esc(cheaper.answer)}</dd></div>
<div><dt>How sure</dt><dd>${howSure(item)}</dd></div>
${item.notes ? `<div><dt>Notes</dt><dd class="note">${withTimes(item.notes, short)}</dd></div>` : ""}
</dl>
<p class="next"><b>Next:</b> ${esc(item.cta)}</p>
${cardFoot(item)}
</article>`;
}

/** A first snapshot of a pricing page: today's plans, so the next run has something to compare with. */
function baselinesSection(baselines: Item[], anchors: Map<Item, string>): string {
  if (baselines.length === 0) return "";
  const card = (item: Item) => `<article class="change grey" id="${anchors.get(item)}">
${cardTop(item, `<span class="badge grey">First look</span>`)}
<h3>${esc(item.what_changed)}</h3>
${item.tiers?.length ? `<ul class="tiers">${item.tiers.map(tierRow).join("")}</ul>` : `<p>${esc(item.after ?? "")}</p>`}
<dl class="facts"><div><dt>How sure</dt><dd>${howSure(item)}</dd></div></dl>
<p class="next"><b>Next:</b> ${esc(item.cta)}</p>
${cardFoot(item)}
</article>`;
  return `<section class="changes">
<h2>First look: prices recorded (${baselines.length})</h2>
${baselines.map(card).join("\n")}
</section>`;
}

function tierRow(tier: Tier): string {
  return `<li><span class="tier">${esc(tier.name)}</span><span class="price">${esc(shownPrice(tier))}</span>${tier.limits.length ? `<span class="limits">${esc(tier.limits.join(" · "))}</span>` : ""}</li>`;
}

function cardTop(item: Item, badge: string): string {
  const slug = competitorSlug(findCompetitor(item.competitor)?.name ?? "");
  return `<header class="change-top">
<div class="who">${mark(slug, 36)}<div><p class="name">${esc(item.competitor)}</p><p class="where">${esc(capitalized(PAGE_NAMES[pageKind(item.page)]))}</p></div></div>
${badge}
</header>`;
}

function cardFoot(item: Item): string {
  const page = PAGE_NAMES[pageKind(item.page)];
  const button = isWebLink(item.link)
    ? `<a class="btn primary" href="${esc(item.link)}" ${NEW_TAB}>Open ${esc(item.competitor)}'s ${esc(page)}${ICONS.out}</a>`
    : "";
  return `<footer class="change-foot">
${button}
<p class="src">Source: ${link(item.link)}</p>
</footer>`;
}

/** The two answers `why` holds, "still cheaper than us?" and "should we respond?" (judging/pricing-item.ts). */
function answers(item: Item): { cheaper: { question: string; answer: string }; respond: string } {
  const at = item.why.indexOf(RESPOND_QUESTION);
  const first = at >= 0 ? item.why.slice(0, at).trim() : "";
  const respond = at >= 0 ? item.why.slice(at + RESPOND_QUESTION.length).trim() : item.why;
  const asked = /^(Still cheaper than us[^?]*\?)\s*(.*)$/s.exec(first);
  const cheaper = asked ? { question: asked[1], answer: asked[2] } : { question: "Against Brightloop", answer: item.brightloop_comparison };
  return { cheaper, respond };
}

/** The confidence in words first, the score after them: never a bare score. */
function howSure(item: Item): string {
  const label = item.confidence_label;
  const colon = label.indexOf(":");
  const word = colon > 0 ? label.slice(0, colon) : label;
  const rest = colon > 0 ? label.slice(colon) : "";
  const sure = word === "confirmed";
  return `<span class="sure ${sure ? "ok" : "amber"}">${sure ? ICONS.check : ICONS.warn}${esc(capitalized(word))}</span>${esc(rest)} <span class="score">(${esc(item.confidence)} of 1)</span>`;
}

// ---------------------------------------------------------------------------------------------
// The Slack line, and the record

function slackSection(result: Result): string {
  if (!result.slack) return "";
  const { line, status } = result.slack;
  return `<section class="slack">
<div><p class="slack-head">${ICONS.slack}<b>${esc(SLACK_WORDS[status] ?? status)}</b></p>
<p class="slack-msg">${esc(line)}</p></div>
${channelButton(`Open in Slack${ICONS.out}`)}
</section>`;
}

/** A button to the channel the Slack line goes to. */
function channelButton(content: string): string {
  if (!isWebLink(AUDIENCE.slackChannelUrl)) return "";
  return `<a class="btn" href="${esc(AUDIENCE.slackChannelUrl)}" ${NEW_TAB}>${content}</a>`;
}

function skippedSection(result: Result, short: (iso: string) => string): string {
  const entries = result.skipped.map((entry) => {
    const competitor = COMPETITORS.find((known) => entry.id.includes(competitorSlug(known.name)) || entry.reason.includes(known.name));
    const picture = competitor ? mark(competitorSlug(competitor.name), 22) : `<span class="no-mark"></span>`;
    return `<li>${picture}<div><p>${withTimes(entry.reason, short)}</p><p class="id">${esc(entry.id)}</p></div></li>`;
  });
  return `<details class="more">
<summary><span>Skipped signals: seen this week, not counted as a change</span><span class="count">${result.skipped.length}</span></summary>
${entries.length ? `<ul class="rows">${entries.join("")}</ul>` : `<p class="empty">No signals were skipped.</p>`}
</details>`;
}

function historySection(history: RunLogEntry[] | undefined, short: (iso: string) => string): string {
  if (!history) {
    return `<details class="more">
<summary><span>Run history: kept by the scheduled and manual runs</span></summary>
<p class="empty">This page was made from a single run, so it has no history.</p>
</details>`;
  }
  const runs = [...history].reverse();
  return `<details class="more">
<summary><span>Run history</span><span class="count">${esc(plural(runs.length, "run"))}</span></summary>
<ul class="rows runs">${runs
    .map(
      (entry) => `<li><div>
<p><b>${esc(short(entry.started_at))}</b> · ${esc(entry.pages_fetched)} of ${esc(plural(entry.pages_watched, "page"))} · ${entry.errors.length === 0 ? "no problems" : esc(plural(entry.errors.length, "problem"))}</p>
${entry.errors.length ? `<ul class="errs">${entry.errors.map((error) => `<li>${esc(error)}</li>`).join("")}</ul>` : ""}
<p class="id">${slackCell(entry)}</p>
</div></li>`,
    )
    .join("")}</ul>
</details>`;
}

function slackCell(entry: RunLogEntry): string {
  if (entry.slack_line === null) return "no line written";
  const status = entry.slack_status;
  return `${esc(status ? (SLACK_WORDS[status] ?? status) : "")}: <q>${esc(entry.slack_line)}</q>`;
}

/** What happened to the Slack line, in the audience's words: no setting names on the page. */
const SLACK_WORDS: Record<SlackDelivery["status"], string> = {
  posted: `Posted to ${AUDIENCE.slackChannel}`,
  "not posted: only a live run posts": `Not posted to ${AUDIENCE.slackChannel}: this was a test run, not a check of the live pages`,
  "not posted: no SLACK_WEBHOOK_URL": `Not posted to ${AUDIENCE.slackChannel}: this run had no Slack connection`,
  "not posted: the post failed": `Not posted to ${AUDIENCE.slackChannel}: Slack did not accept it`,
};

// ---------------------------------------------------------------------------------------------
// Small helpers

/** Respond-now first, then the watches, then the rest; the order within each kept. */
function ordered(items: Item[]): Item[] {
  const rank = (item: Item) => (isRespondNow(item) ? 0 : item.action.startsWith("watch") ? 1 : 2);
  return [...items].sort((a, b) => rank(a) - rank(b));
}

function isRespondNow(item: Item): boolean {
  return item.action.startsWith(RESPOND_NOW);
}

function actionTone(action: string): Tone {
  if (action.startsWith(RESPOND_NOW)) return "red";
  if (action.startsWith("watch")) return "amber";
  return "grey";
}

/** An item's page as a page kind; anything that is not the homepage is the pricing page. */
function pageKind(page: string): PageKind {
  return page.startsWith("home") ? "homepage" : "pricing";
}

function pageUrl(competitor: Competitor, page: PageKind): string {
  return page === "pricing" ? competitor.pricingPage : competitor.homepage;
}

function link(url: string): string {
  return isWebLink(url) ? `<a href="${esc(url)}" ${NEW_TAB}>${esc(url.replace(/^https?:\/\//, ""))}</a>` : esc(url);
}

function isWebLink(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Escaped text with each UTC timestamp in it ("2026-10-23T08:24:20.861Z") shown as the audience's time. */
function withTimes(text: string, short: (iso: string) => string): string {
  return esc(text).replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z\b/g, (iso) => esc(short(iso)));
}

/** "Monday 26 October 2026, 08:30 Jerusalem time"; the text itself when it is not a time. */
function moment(iso: string, timeZone: string): string {
  const parts = timeParts(iso, timeZone, { weekday: "long", month: "long", year: "numeric" });
  if (!parts) return iso;
  const place = timeZone.split("/").pop()?.replaceAll("_", " ") ?? timeZone;
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute} ${place} time`;
}

/** "Mon 26 Oct, 08:30", for lists; the text itself when it is not a time. */
function shortMoment(iso: string, timeZone: string): string {
  const parts = timeParts(iso, timeZone, { weekday: "short", month: "short" });
  return parts ? `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}` : iso;
}

function timeParts(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> | undefined {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...options }).formatToParts(at);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
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

// Light, blue-grey ground, white cards; red, amber and green only on statuses and changes.
const STYLE = `
:root { color-scheme: light; --bg: #f4f7fb; --surface: #ffffff; --line: #e3e9f2; --line-2: #cfd9e6; --ink: #0f1d33; --soft: #4a5b74; --faint: #6b7a90; --blue: #2563eb; --blue-2: #1d4ed8; --blue-soft: #eaf1ff; --green: #15803d; --green-soft: #e8f6ee; --red: #c2410c; --red-2: #b42318; --red-soft: #fff0ea; --amber: #a15c00; --amber-soft: #fff6e0; --grey: #4a5b74; --grey-soft: #eef2f7; --r: 14px; --shadow: 0 1px 2px rgb(15 29 51 / 0.05), 0 4px 16px -8px rgb(15 29 51 / 0.12); }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
p { margin: 0; }
a { color: var(--blue); text-underline-offset: 3px; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 6px; }
::selection { background: #cfe0ff; }
.icon { width: 16px; height: 16px; flex: none; }
.mark { flex: none; border-radius: 8px; }
.wrap { max-width: 860px; margin: 0 auto; padding: 0 20px 56px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 22px 0 18px; }
.brand { font-weight: 650; letter-spacing: -0.01em; }
.when { color: var(--soft); font-size: 15px; }
.hero { display: flex; gap: 16px; align-items: flex-start; padding: 24px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); }
.hero-icon { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%; }
.hero-icon .icon { width: 22px; height: 22px; }
.hero.green .hero-icon { background: var(--green-soft); color: var(--green); }
.hero.red .hero-icon { background: var(--red-soft); color: var(--red); }
.hero.amber .hero-icon { background: var(--amber-soft); color: var(--amber); }
.hero h1 { font-size: clamp(1.45rem, 3.6vw, 1.9rem); line-height: 1.2; letter-spacing: -0.02em; margin: 6px 0; text-wrap: balance; overflow-wrap: anywhere; }
.hero-text { min-width: 0; }
.hero-text > p { color: var(--soft); max-width: 58ch; }
.hero .btn { margin-top: 16px; }
.btn { display: inline-flex; align-items: center; gap: 8px; min-height: 40px; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: 15px; text-decoration: none; color: var(--ink); background: var(--surface); border: 1px solid var(--line-2); transition: background-color 150ms ease, border-color 150ms ease; }
.btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }
.btn.danger { background: var(--red-2); border-color: var(--red-2); color: #fff; }
@media (hover: hover) { .btn:hover { background: var(--grey-soft); } .btn.primary:hover { background: var(--blue-2); } .btn.danger:hover { background: #962018; } }
.comps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 16px 0 8px; }
.comp { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 16px; min-width: 0; }
.comp-top { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.comp .name { font-weight: 650; font-size: 17px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; padding: 4px 10px; border-radius: 99px; text-decoration: none; }
.pill.green { background: var(--green-soft); color: var(--green); }
.pill.red { background: var(--red-soft); color: var(--red); }
.pill.amber { background: var(--amber-soft); color: var(--amber); }
.pill.grey { background: var(--grey-soft); color: var(--grey); }
.pill .icon { width: 14px; height: 14px; }
.pages { list-style: none; margin: 14px 0 0; padding: 12px 0 0; border-top: 1px solid var(--line); display: grid; gap: 8px; font-size: 14px; }
.pages li { display: grid; gap: 1px; }
.pages a { color: var(--ink); font-weight: 500; text-decoration-color: var(--line-2); }
.state { display: inline-flex; align-items: center; gap: 5px; color: var(--soft); }
.state .icon { width: 14px; height: 14px; }
.state.ok .icon { color: var(--green); }
.state.red { color: var(--red); }
.state.amber { color: var(--amber); }
h2 { display: flex; align-items: center; gap: 8px; font-size: 1.15rem; letter-spacing: -0.01em; margin: 36px 0 12px; }
.problems h2 { color: var(--amber); }
.problems .lede { color: var(--soft); margin: -4px 0 12px; }
.problems ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.problems li { display: flex; gap: 16px; align-items: center; justify-content: space-between; flex-wrap: wrap; padding: 16px; border-radius: var(--r); background: var(--amber-soft); border: 1px solid #f5dfa8; }
.problems li p { max-width: 52ch; overflow-wrap: anywhere; }
.change { scroll-margin-top: 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 20px; margin-bottom: 14px; box-shadow: var(--shadow); }
.change.red { border-color: #f6c7b4; box-shadow: 0 0 0 3px var(--red-soft), var(--shadow); }
.change:target { box-shadow: 0 0 0 3px #bcd3ff, var(--shadow); }
.change-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.who { display: flex; gap: 12px; align-items: center; min-width: 0; }
.who .name { font-weight: 650; overflow-wrap: anywhere; }
.who .where { color: var(--soft); font-size: 14px; }
.badge { flex: none; font-size: 13px; font-weight: 700; padding: 5px 10px; border-radius: 99px; }
.badge.red { background: var(--red-2); color: #fff; }
.badge.amber { background: var(--amber-soft); color: var(--amber); }
.badge.grey { background: var(--grey-soft); color: var(--grey); }
.change h3 { font-size: 1.25rem; line-height: 1.3; letter-spacing: -0.015em; margin: 16px 0 14px; text-wrap: balance; overflow-wrap: anywhere; }
.ba { display: grid; grid-template-columns: 1fr auto 1fr; align-items: stretch; gap: 10px; }
.side { padding: 12px 14px; border-radius: 10px; background: var(--grey-soft); min-width: 0; }
.side.after { background: var(--blue-soft); }
.red .side.after { background: var(--red-soft); }
.k { font-size: 13px; color: var(--soft); font-weight: 500; }
.v { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; margin-top: 2px; overflow-wrap: anywhere; }
.before .v { color: var(--soft); text-decoration: line-through; text-decoration-thickness: 2px; text-decoration-color: var(--line-2); }
.to { display: grid; place-items: center; color: var(--faint); }
.facts { display: grid; gap: 12px; margin: 18px 0 0; }
.facts dt { font-size: 13px; font-weight: 600; color: var(--soft); }
.facts dd { margin: 2px 0 0; max-width: 66ch; overflow-wrap: anywhere; }
.facts .note { color: var(--soft); font-size: 14px; }
.sure { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; }
.sure.ok { color: var(--green); }
.sure.amber { color: var(--amber); }
.score { color: var(--faint); font-size: 14px; white-space: nowrap; }
.next { margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: var(--blue-soft); color: #1e3a6e; overflow-wrap: anywhere; }
.change-foot { display: flex; align-items: center; gap: 12px 16px; flex-wrap: wrap; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--line); }
.src { font-size: 14px; color: var(--soft); overflow-wrap: anywhere; }
.tiers { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; }
.tiers li { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 14px; border-top: 1px solid var(--line); }
.tiers li:first-child { border-top: 0; }
.tier { font-weight: 600; }
.price { font-weight: 650; font-variant-numeric: tabular-nums; text-align: right; }
.limits { grid-column: 1 / -1; font-size: 14px; color: var(--soft); }
.slack { display: flex; align-items: center; justify-content: space-between; gap: 12px 16px; flex-wrap: wrap; margin-top: 28px; padding: 14px 16px; border-radius: var(--r); background: var(--surface); border: 1px solid var(--line); }
.slack > div { flex: 1 1 320px; min-width: 0; }
.slack-head { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--soft); }
.slack-head b { color: var(--ink); }
.slack-msg { margin-top: 6px; overflow-wrap: anywhere; }
.more { margin-top: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); }
.more summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; font-weight: 600; }
.more summary::-webkit-details-marker { display: none; }
.more summary::after { content: ""; width: 8px; height: 8px; border-right: 2px solid var(--faint); border-bottom: 2px solid var(--faint); transform: rotate(45deg); margin: -4px 4px 0 0; transition: transform 150ms ease; }
.more[open] summary::after { transform: rotate(225deg); margin-top: 4px; }
.more summary span:first-child { flex: 1; }
.count { font-size: 13px; font-weight: 600; color: var(--soft); background: var(--grey-soft); border-radius: 99px; padding: 2px 9px; white-space: nowrap; }
.rows { list-style: none; margin: 0; padding: 0 16px 8px; }
.rows > li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; border-top: 1px solid var(--line); }
.rows > li > div { min-width: 0; overflow-wrap: anywhere; }
.rows .id { color: var(--faint); font-size: 13px; margin-top: 2px; }
.runs q { quotes: none; }
.errs { margin: 4px 0 0; padding-left: 18px; color: var(--amber); font-size: 14px; }
.no-mark { width: 22px; flex: none; }
.empty { padding: 0 16px 14px; color: var(--soft); }
.foot { margin-top: 32px; font-size: 14px; color: var(--faint); text-align: center; }
@media (max-width: 700px) {
  .comps { grid-template-columns: 1fr; }
  .comp { display: grid; grid-template-columns: 1fr auto; align-items: center; column-gap: 8px; padding: 14px; }
  .comp-top { margin: 0; }
  .comp .pages { grid-column: 1 / -1; grid-template-columns: 1fr 1fr; }
}
@media (max-width: 520px) {
  .wrap { padding: 0 14px 40px; }
  .hero { flex-direction: column; gap: 10px; padding: 18px; }
  .change { padding: 16px; }
  .ba { grid-template-columns: 1fr 1fr; }
  .to { display: none; }
  .btn.primary, .btn.danger { width: 100%; justify-content: center; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
`;
