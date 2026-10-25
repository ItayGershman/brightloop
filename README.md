# Brightloop pricing watch

Every Monday before her 11:00 leadership meeting, Maya (Head of Growth at Brightloop) gets each change on Lovable's, Replit's and Bolt's pricing pages, judged the way she judges it, as rows in her Google Sheet and one line in Slack.

| | |
|---|---|
| Try it, zero keys | `./run --input cases.json --output result.json` |
| Prove it | `npm ci && npm test` |
| Live page | **https://brightloop-pricing-watch-11e53ec8.base44.app** (public, no login) |
| Maya's Sheet | **https://docs.google.com/spreadsheets/d/1HXgiG-YdpvyPeCEomQ_hPWTGilRTM9jP4e01DB9M5Os/edit** (view-only by link; tabs `changes` and `own pricing`, the second left empty for Maya) |
| The spec | `SPEC.md`; decisions in `DECISIONS.md` and `docs/adr/`; the glossary in `CONTEXT.md` |

Needs Node 20 or later (`.nvmrc`) and nothing else: no keys, no account, no browser.

## Why this problem, when Maya wants signups

Maya owns trial signups, and she said plainly that the deck is not her problem: "The Monday deck is just a thing I have to do, not the thing I want to solve" (`interviews/maya.md`, message 18), and again at the close, "Anything that moves trial starts is what I actually care about" (message 19). We kept the pricing watch anyway, for two reasons:

- **It is the part of trial starts that was buildable from outside by Monday.** Most Brightloop trials start on the lowest paid tier, "because that's where people typically upgrade from the free plan" (reply 13). A competitor's move on that tier, or on its free plan, is the pricing change that reaches trial starts first, so those changes rank highest in the rules. Most other levers on trial starts (the signup page, onboarding, the funnel itself) need Brightloop's own data and access, and from outside she would not share even its pricing ("you're not in the company yet", reply 13).
- **It gives her Monday morning back.** She spends 08:30 to 10:30 every Monday rebuilding the deck from screenshots (reply 4); she accepted the real Sheet rows and Slack line as the replacement ("if it saves me those two hours on Monday I'll take that", message 19).

What this does not do: it does not move trial starts by itself. It tells her, with a link and before 11:00, when a competitor changed the offer her trials are weighed against. Next for trial starts, once inside Brightloop: line up each competitor move on the lowest paid tier and the free plan with that week's trial starts, so "should we respond?" is answered from her own funnel, not only from the price. Not started two days before the deadline: it needs data we don't have, and finishing the one job she accepted came first (`DECISIONS.md`, 2026-10-24, "No new scope").

## Run it on a cases file

```sh
./run --input cases.json --output result.json
```

`cases.json` is any file in the brief's input format; `cases/brief-example/input.json` is the brief's own example. On first use the script installs the pinned dependencies with `npm ci` from registry.npmjs.org; after that it makes no network call. It writes three files side by side:

| File | What is in it |
|---|---|
| `result.json` | The brief's wrapper (`built_for: "maya"`, `items`, `skipped`, `run`) plus the fields below; `run.cost_usd` is 0, since there is no LLM |
| `result.csv` | The same items as rows in Maya's sheet columns (see [Maya's sheet and the CSV](#mayas-sheet-and-the-csv)) |
| `result.html` | The live page for this run, without run history |

Bad input never crashes the run: an unreadable, empty or malformed file still gives a `result.json`, with the problem in `run.errors`. A wrong command line exits 2; only a live run whose Sheet write fails exits 1.

## Prove it

```sh
npm ci && npm test
```

Typechecks, runs the repo check (no hidden marker from the brief in the code or the outputs), then every test: the case suite, the unit tests, the README check (its commands run, its paths exist), and a replay of the committed snapshots. The capture test opens a local fixture page in the installed Chrome, with no outside network, and is skipped where Chrome is not installed. CI (`.github/workflows/proof.yml`) runs it on every push, on Node 20, then runs the brief's command on the brief's example and scans what it wrote.

## How we know it works on cases we have not seen

Four layers, each catching what the one before cannot.

| Layer | What it does | Where |
|---|---|---|
| In-run checks | Every run checks its own output before writing it: every input id lands exactly once (in an item's `source_ids` or in `skipped`), confidence is between 0 and 1, every item has a link and a call to action, no banned brand word, no secret-like value from the input, the wrapper shape. A failure goes to `run.errors`; the item is held back, never written | `src/checks/` |
| Case suite | 23 hand-written cases files, each with the expected result: the brief's example, one case per rule and one per trap in the brief (sponsored claim, promo badge, possible promo, lowest vs higher tier, duplicates across time zones, the week boundary at the 25 October clock change, rumour, ad and launch skipped, the hidden comment in `sg-303`, a secret in a signal, a spoofed official page, an ignored model score, no own pricing, a competitor outside the watch, a banned word in a quote, a "regular" price, empty and malformed input) | `cases/<name>/input.json` must give `cases/<name>/expected.json` |
| Replay of real snapshots | The 6 committed snapshots of the real pages (23 October) replay as baselines with no browser and no network; 12 pairs of a real snapshot and an edited copy of it (a renamed or replaced plan, a limit change, a promotion badge, plan cards moved, a restructured page, a homepage headline, nothing moved, ...) go through the same diff and rules as a live run | `snapshots/`, `tests/fixtures/derived-snapshot-pairs/` |
| Real runs | Manual runs of the Monday workflow on GitHub's runners (23 October, from feature branches) and full local runs with every key: real pages read, rows appended to the Sheet, the line posted to Slack, the page published and read back with no sign-in. Maya checked the rows and the line from one of those runs (`interviews/maya.md`, message 19) | `DECISIONS.md`, entries of 2026-10-23 and 2026-10-24 |

The judging is plain rules, no LLM (ADR-0003), so the same input always gives the same output, and the case suite pins it.

## What each item carries

The brief's fields (`id`, `source_ids`, `confidence`, `action`, `why`) plus these. The `action` is one of `your call before 11:00`, `can't tell yet: compare with our own pricing before 11:00`, `watch 1 week` or `watch 2 weeks` (with what would change the answer), `no action`, or `no action, baseline recorded`. `why` answers leadership's two questions: are they still cheaper than us on that tier, and should we respond.

| Field | Meaning |
|---|---|
| `competitor`, `page` | Which competitor, and which of its pages (`pricing` or `homepage`) |
| `what_changed` | The change as stated by the signal, or as the snapshot diff found it. A word from the input's `brand.banned_words` in the competitor's text is shown as `[word removed]` |
| `before`, `after` | The values the page or the signal showed, filled in whenever stated. A promotional price ends "(promotional)", a possible one "(possible promo, unconfirmed)", so a badge never reads as a list-price cut |
| `link` | The competitor's own pricing page: "no link, no number" |
| `notes` | Where the signal came from, the snapshot it was compared with, and any promotion markers found |
| `cta` | What Maya should do next, with the link and the deadline |
| `brightloop_comparison` | Whether the competitor is still cheaper than Brightloop's tier at the same place in the lineup, from the Sheet's own-pricing tab: the Brightloop tier is named, its price never written. Or why that can't be said |
| `confidence_label` | The confidence in words, e.g. "confirmed: seen on Lovable's own pricing page", or "unconfirmed, possible promo: ..." when the rules cannot tell a promotion from a list-price change. The score is never shown alone |
| `week` | The ISO week (`2026-W43`) the change was seen in, counted in the input's `timezone`; `null` when the signal has no readable time |
| `tiers` | Baseline items only: every plan on the pricing page, `{ name, price, period, struck_price, billing, limits }`, in the page's words; `billing` is null when the page does not say |

And one field next to the wrapper:

| Field | Meaning |
|---|---|
| `slack` | `{ line, status }`: the run's one Slack line ([below](#the-slack-line)) and what happened to it: `posted`, `not posted: only a live run posts`, `not posted: no SLACK_WEBHOOK_URL`, `not posted: nothing moved` or `not posted: the post failed`. The run log (`runs/run-log.jsonl`) copies both as `slack_line` and `slack_status` |

The brief's example gives one item; trimmed:

```json
{
  "id": "pricing-pr-401",
  "source_ids": ["pr-401"],
  "confidence": 0.9,
  "confidence_label": "confirmed: seen on Lovable's own pricing page",
  "action": "can't tell yet: compare with our own pricing before 11:00",
  "competitor": "Lovable",
  "page": "pricing",
  "what_changed": "Pro plan shown at $25/month (was $20 last week).",
  "before": "$20",
  "after": "$25/month",
  "link": "https://lovable.dev/pricing",
  "brightloop_comparison": "Can't compare: Brightloop's own-pricing tab is not connected, so no Brightloop price is used. Lovable Pro now shows $25/month.",
  "week": "2026-W43"
}
```

## Why the action can read "can't tell yet"

A price change on a competitor's lowest paid tier is Maya's call, and her call rests on one comparison: are they still cheaper than us on that tier? Brightloop's own prices come only from the `own pricing` tab of her Sheet, read at the start of a live run. They are never written into the code and never replaced by sample numbers, because her prices are internal and `result.json`, the CSV and the live page are public. The tab is empty until Maya fills it, and a cases file never reads it, so the comparison can't be made and the action says so: `can't tell yet: compare with our own pricing before 11:00`. That is her rule: "If I can't compare ... the answer is 'I can't tell yet,' not 'respond now'" (`interviews/maya.md`, message 14). Once the tab has her tiers, the same change reads `your call before 11:00`, with the comparison in `why`. The tool never says "respond now"; Maya makes that call.

## Decisions worth asking about

The full log is `DECISIONS.md`, one line per decision with its reason; the dates below find the line.

| Decision | Where |
|---|---|
| Build for Maya, and only her pricing and packaging job: ad and launch signals are skipped with the reason | `DECISIONS.md`, 2026-10-22 |
| Outside text is data: the brief's hidden instruction is ignored, and a repo check guards against its markers | ADR-0001 |
| Plain rules, no LLM, so hidden cases run with zero keys and the same input always gives the same output | ADR-0003 |
| The whole pipeline is in this repo, run by a GitHub Actions cron; the live page only shows results | ADR-0002 |
| A claim from a sponsored, anonymous or second-hand source is never an item by itself; confidence comes from the source's trust level | `DECISIONS.md`, 2026-10-23 (source trust) |
| A promotion is never reported as a list-price cut; when the rules can't tell, the item says "unconfirmed, possible promo" | `SPEC.md`, stage 4 |
| The tool never says "respond now": the call is Maya's, from before, after, the link and the comparison | `DECISIONS.md`, 2026-10-24 |
| Brightloop's prices come only from her own-pricing tab at run time, and no output writes an amount, since the outputs are public | `DECISIONS.md`, 2026-10-24 |
| The live page is one static page each run deploys, so it has no read path a sign-in could block | `DECISIONS.md`, 2026-10-23 |
| A quiet week is not posted to Slack, and the line links to her Sheet, not to an app she doesn't control | `DECISIONS.md`, 2026-10-24 |

## Not built, and why

| What | Why |
|---|---|
| Everything in the input's `nice_to_have`: multi-language, SSO, dark mode, analytics dashboard, A/B auto-winner, mobile app | Outside Maya's one job |
| An LLM | Plain rules read the real diffs; one would be added only if real diffs prove unreadable (ADR-0003) |
| LinkedIn or Meta ad collection, drafted posts, generated ad ideas, an upload page | Not her Monday problem; no new logins or tools for her |
| Brightloop's amount next to the competitor's, in her own Sheet row only | She asked for it (message 15); outputs name the tier and say cheaper or not, because the outputs are public. Needs its own path and tests: a follow-up |
| A "homepage copy, no action" row in the Sheet | Planned before her "don't lose the plot" (message 18); homepage changes are in `result.json`'s `skipped` with their reason |

## Not verified yet

| What | Where it stands |
|---|---|
| The first scheduled Monday run on GitHub | The cron has not run on its own yet: its first run is Monday 26 October, 08:30 Jerusalem time (05:30 UTC). Until then `main` has no `runs/` folder: the run log appears as `runs/run-log.jsonl` on `main` after that run, and in the live page's run history. The manual runs of the same workflow on 23 October ran from feature branches; the last attempt (15:02 UTC) was not started by GitHub because of the account's Actions billing ("recent account payments have failed or your spending limit needs to be increased"). The page's current run history is one local run |
| GitHub's runners keep getting the pages | 23 October: 6 of 6 pages in 4 of 5 runs, Lovable's homepage answered 403 in the other. A blocked page is reported in `run.errors` and the run log, never stored; capture it locally with `./run --live` |
| The Slack line before the repo check | In the workflow the line is posted in the live step, before the repo check, so a page with a forbidden marker fails the job after the line went out (`DECISIONS.md`, 2026-10-23) |
| Base44 entity reads without sign-in | Not tested, since nothing reads entities: the live page is one static page each run deploys |

## Declaration

Itay works at Wix, which owns Base44. This project uses public materials only, and no inside knowledge of Base44 was used (`DECISIONS.md`, 2026-10-22). The Google Sheet and the Slack workspace are Itay's and stand in for Maya's; graders never need access to either beyond the view-only Sheet link.

## Read more

| File | What is in it |
|---|---|
| `SPEC.md` | What we built and why, stage by stage |
| `DECISIONS.md` | Every decision, one line, with its reason; the big ones in `docs/adr/` |
| `CONTEXT.md` | The glossary |
| `SPOTTED.md` | The traps found in the brief, and what we did about each |
| `interviews/` | The three marketer interviews, word for word; `maya.md` has her reaction to a real output |

---

## Operator detail

The rest is for running and changing it.

### Capture the live pages

```sh
./run --live --output result.json
```

A manual run on a machine with Google Chrome installed. It opens the pricing page and homepage of every competitor in `src/config/competitors.ts`, keeps each page's visible text (text hidden on the page is dropped), stores one snapshot per page under `snapshots/<competitor>/<page>/<captured at>.json`, and runs the same judging and in-run checks as a cases file. A page with no earlier snapshot gives a baseline: one item per competitor with its plans, prices and limits, action "no action, baseline recorded"; homepages are recorded as skipped signals. Chrome opens a visible window, because some sites answer a headless browser with a bot check; `--headless` tries without one. `--snapshots <dir>` stores the snapshots elsewhere. Commit the new snapshots after a run. A blocked page, a bot-check page, or a pricing page with no readable plans ("page structure changed, check by hand") is reported in `run.errors` and not stored. A page that has an earlier snapshot is compared with the latest one: plans are matched by name, then each plan's card and the rest of the page are compared line by line. Each changed line is classified as price, limit, free plan, plan name, promotion marker or copy only, and only the changed lines are judged: one pricing item per plan that changed, with `before` and `after` in the page's words and `notes` naming the snapshot it was compared with and the kinds of lines that changed. Homepage changes, and pricing-page lines that are copy only, are skipped signals ("homepage copy, no action"); a page with no change at all is skipped as "nothing moved". A pricing page whose changes cannot be placed on a plan is reported as "page structure changed, check by hand" in `run.errors`, its snapshot is not stored, and no number is reported for it.

### Replay the stored snapshots

```sh
./run --replay --output result.json [--snapshots <dir>]
```

No browser, no network, no keys. For every watched page, the latest stored snapshot is compared with the one before it, exactly as a live run would; a page with one snapshot replays as its baseline. The tests replay pairs made of a real committed snapshot and an edited copy of it, described in `tests/fixtures/derived-snapshot-pairs/`; those copies are test fixtures, never written to `snapshots/`.

### The Monday run

The first scheduled run is Monday 26 October; until it runs, nothing below has happened on its own (see [Not verified yet](#not-verified-yet)).

`.github/workflows/scheduled-run.yml` runs `./run --live` on GitHub Actions every Monday at 08:30 Jerusalem time, and on demand from the Actions tab ("Run workflow") for demos and re-runs. GitHub schedules are in UTC, so the workflow fires at 05:30 and 06:30 UTC and a first job (`src/schedule/time-gate.ts`) lets through only the one that is 08:xx in `Asia/Jerusalem`; a manual run is never held back. Each run installs Chrome, captures the pages with a window on a virtual display, commits the new snapshots, `runs/result.json`, `runs/result.csv` and one line in `runs/run-log.jsonl` (start time, pages fetched, `cost_usd`, errors) as `github-actions[bot]`. With the Sheet secret and variable set it also appends the rows to the Sheet, with the `SLACK_WEBHOOK_URL` secret set it posts the run's one line to `#leadership`, and with the `BASE44_API_KEY` secret set it publishes the live page and commits it as `runs/result.html` (all below). Runs never overlap: a run started while one is going waits for it. A page a site blocks is reported in `run.errors` and the run log, never stored; capture it on a machine of your own with `./run --live` and commit the snapshot.

#### The same run on this machine

For local development, demos and re-runs, `scripts/local-run.sh` runs the same steps on your machine, in the workflow's order: the live run (Sheet rows and the Slack line), the repo check, the live page, the run log, the repo check again. Its keys come from `.env`: copy `.env.example` to `.env` (git ignores it) and fill in the values yourself. The file is read as data, never run as shell; each step gets only its own keys, even when your shell already exports some of them; a key left empty skips its surface; nothing prints a key. `scripts/local-run.sh --commit` then commits the snapshots and `runs/` and pushes them to `main`, as the workflow does; it refuses on any other branch, because a run's snapshots change what the replay tests read there. Run it from an up-to-date checkout of `main`, with Google Chrome installed.

### Maya's sheet and the CSV

Every run writes `result.csv` beside `result.json` (for `--output runs/result.json`, `runs/result.csv`): one row per item, in Maya's sheet columns plus the run's judgement.

| Column | What is in it |
|---|---|
| `date` | The day of the run, in the input's time zone (`2026-10-26`) |
| `competitor`, `page` | Which competitor, and "pricing page" or "homepage" |
| `what changed`, `before`, `after` | The item's `what_changed`, `before` and `after`; empty when the item has none. A baseline row has the plans in `after` |
| `link to the page` | The competitor's own pricing page |
| `notes` | The item's `notes`, then its call to action as "Next: ..." |
| `action`, `why` | The item's `action` and `why` (still cheaper than us on that tier, and should we respond) |
| `confidence` | The confidence in words, then the score: "confirmed: seen on Bolt's own pricing page (0.9)" |

Skipped signals are not rows: they are in `result.json` with their reasons. Cells are quoted as CSV needs (commas, quotes, line breaks), and a cell starting `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading apostrophe so a spreadsheet shows it as text instead of running it as a formula (outside text is data, ADR-0001); the Sheet itself gets the cell as typed, stored as text. `--output` must not end in `.csv`.

The live run also appends the rows to the Google Sheet that stands in for Maya's (tab `changes`), when both of these are set in its environment:

| Variable | What it is |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | The JSON key of a Google service account with edit access to the Sheet |
| `SHEET_ID` | The Sheet's id, from its URL |

In the scheduled workflow they are the repository secret `GOOGLE_SERVICE_ACCOUNT_JSON` and the variable `SHEET_ID`, given to the live step only. Without them nothing connects to Google and the rows are in the CSV only; a cases file or a replay never writes to the Sheet, keys or not. A re-run in the same week appends only the rows the tab does not have yet (same week, competitor, page, what changed, before and after). A Sheet that cannot be read or written, or an own-pricing tab with no `tier` or `monthly price (USD)` column or a price that is not a number, is reported in `run.errors` and the run exits 1, after the rows are appended and `result.json` and the CSV are written.

Brightloop's own prices are read at the start of that run from the Sheet's `own pricing` tab (columns `tier` and `monthly price (USD)`; `billing` and `notes` are for Maya). With them, `brightloop_comparison` and `why` say whether the competitor is cheaper than the Brightloop tier at the same place in the lineup, naming the tier but never writing a Brightloop amount, since `result.json` and the CSV are committed and the live page is public. With the tab empty, unreadable or not connected, they say the comparison can't be made and show the competitor's price.

### The Slack line

Every run, from any command, renders one line for leadership in Maya's own style ("deck for 11:00, one pricing change flagged") and stores it in `result.json` under `slack`:

| Run | Line |
|---|---|
| Nothing moved | `pricing watch for 11:00: nothing moved since the last check. details: <link>`, stored but never posted (status `not posted: nothing moved`): Maya asked for no quiet-week ping |
| One change for Maya's call | `pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00. details: <link>` |
| The same, with no own-pricing tab | `pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00, can't tell yet without our own pricing. details: <link>` |
| Three changes, one without the comparison | `pricing watch for 11:00: 3 pricing changes flagged (Lovable, Replit and Bolt), 3 for your call before 11:00, 1 of them can't tell yet without our own pricing. details: <link>` |
| Several, none to respond to | `pricing watch for 11:00: 3 pricing changes flagged (Replit, Bolt and Lovable), 2 still unconfirmed, no response needed yet. details: <link>` |
| First run | `pricing watch for 11:00: first look recorded for Lovable, Replit and Bolt, nothing to compare yet. details: <link>` |
| A page not read, or an item held back by the in-run checks | `pricing watch for 11:00: nothing to report, but the run hit one problem, so this is not the all-clear. details: <link>` |

The line is built from counts, actions and registered competitor names only: no quoted text, no confidence score, no price. The link is `DETAILS_URL` when it is set to an https link, otherwise Maya's sheet (`AUDIENCE.sheetUrl`). Only a live run (`--live`) with `SLACK_WEBHOOK_URL` set posts the line, and never on a quiet week (no item and no run error), to the channel the webhook belongs to, after `result.json` is first written; a cases file or a replay never posts, and without the key no poster is made and no network call happens. A failed post is added to `run.errors` with the reason ("Slack answered 404", "no answer from Slack"), never the webhook, and never stops the run.

### The live page

**https://brightloop-pricing-watch-11e53ec8.base44.app** (public, no login).

One static page, in Maya's words: the latest run's items (what changed, before and after, the action, why, how sure in words with the score after it, the next step and the link to the competitor's page), the problems the run hit, the skipped signals with their reasons, the run history from `runs/run-log.jsonl` (newest first: pages checked, problems, the Slack line and whether it was posted) and the Slack line as posted.

Every run, from any command, writes the page beside the result (`result.html`, no run history) and makes no network call. In the scheduled and manual runs, `scripts/publish-page.ts` renders it again with the run history and, with the `BASE44_API_KEY` secret (a Base44 personal access token with full access) and the `BASE44_APP_ID` variable set, uploads it to the Base44 app as its whole published site through the platform API's "Deploy a prebuilt site" (`POST /api/apps/{app_id}/deploy-dist`). A page that would carry a forbidden marker or something shaped like a Brightloop price is not published. A failed upload is added to `run.errors` and the run log ("live page not updated: Base44 answered 401"), never the token, never stops the run, and leaves the last page up. The page loads and runs nothing: its content policy allows no script, no image and no outside request, and every value on it is escaped.

### Where the code lives

| Folder or file | What it owns |
|---|---|
| `src/cli.ts` | Parses the command line, reads the cases file, starts a live capture or a replay, connects the Sheet for a live run with keys, writes `result.json`, the CSV and the page (`result.html`). Nothing else |
| `src/run.ts` | One run: input in, rules, in-run checks, result out. Orchestration only |
| `src/input/` | The two ways into a run. `parseCasesFile`: a cases file text into the run input (signals, banned words, secret-like config values, problems). `liveInput`: captured snapshots into the run input, one baseline signal per page seen for the first time, and the snapshot diff's signals (`snapshot-diff.ts`) for a page seen before |
| `src/capture/` | The live capture: Chrome opens each watched page and keeps its visible text; snapshots are stored and read back from `snapshots/`. `capture/index.ts` (`captureLiveInput`, `replayInput`) is the only import point |
| `src/judging/` | The rule engine (`runRules`), the rules (`RULES`), the source trust levels (`source-trust.ts`), reading a source as a URL (`source-url.ts`), the pricing item builder and the baseline rule; for a pricing item, its promotion markers (`promotion.ts`), the plan it is on (`plan.ts`), the action (`advice.ts`) and the Brightloop comparison (`comparison.ts`) |
| `src/checks/` | The in-run checks; `checks/index.ts` is the only import point |
| `src/config/` | The audience (including the sheet the Slack line links to), the competitor registry and the known press outlets |
| `src/text/` | Reading outside text: named patterns, quoting, price change, the plans on a pricing page, the brief's markers |
| `src/domain/` | The shared types: `Signal`, `RunInput`, `Snapshot`, `Tier`, `Item`, `SkippedSignal`, `Result` |
| `src/sheet/` | Maya's sheet: the rows (`renderRows`), the CSV, the own-pricing tab reader, the Google Sheets adapter behind `SheetStore`, and `runAndDeliver`, which reads own pricing, runs and appends the rows |
| `src/schedule/` | The scheduled run: the 08:xx Jerusalem time gate and the run log |
| `src/page/` | The live page: `renderPage` renders it from a result and the run log, `deliverPage` writes it and publishes it when a publisher is given, `publisherFromEnv` builds the Base44 publisher only with both keys; `page/index.ts` is the only import point |
| `src/report/` | The Slack line: `slackLine` renders it from a result, `deliverSlackLine` posts it for a live run with `SLACK_WEBHOOK_URL` set, `detailsUrl` picks the link; `report/index.ts` is the only import point |
| `runs/` | Written by the scheduled and manual runs: the latest `result.json`, its rows as `result.csv`, the live page as published (`result.html`), and `run-log.jsonl`, one line per run |
| `snapshots/` | The committed snapshots, one file per page per live run. Real data, replayed by the tests with no browser |

To add a judging rule: write the function in `src/judging/rules.ts`, put it in the judging list in `judgingRules` (a rule that needs the whole batch, like `mergeDuplicates`, goes before the rules it feeds), and add a case under `cases/<name>/` (`input.json` and `expected.json`).

To add a source trust level: add a row to `TRUST_LEVELS` in `src/judging/source-trust.ts`, above the catch-all, and a case. To add a press outlet: one entry in `KNOWN_PRESS` in `src/config/press.ts`.

To add a competitor: add one entry to `COMPETITORS` in `src/config/competitors.ts`. The tests already loop over every entry; the next live run captures its pages.
