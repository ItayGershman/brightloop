# Brightloop pricing watch

A competitor pricing watch for Maya, Head of Growth at Brightloop. The spec is in `SPEC.md`, the decision log in `DECISIONS.md`.

## Run it on a cases file

```sh
./run --input cases.json --output result.json
```

Needs Node 18 or later. On first use the script installs the pinned dev dependencies. No keys are needed.

## Capture the live pages

```sh
./run --live --output result.json
```

A manual run on a machine with Google Chrome installed. It opens the pricing page and homepage of every competitor in `src/config/competitors.ts`, keeps each page's visible text (text hidden on the page is dropped), stores one snapshot per page under `snapshots/<competitor>/<page>/<captured at>.json`, and runs the same judging and in-run checks as a cases file. A page with no earlier snapshot gives a baseline: one item per competitor with its plans, prices and limits, action "no action, baseline recorded"; homepages are recorded as skipped signals. Chrome opens a visible window, because some sites answer a headless browser with a bot check; `--headless` tries without one. `--snapshots <dir>` stores the snapshots elsewhere. Commit the new snapshots after a run. A blocked page, a bot-check page, or a pricing page with no readable plans ("page structure changed, check by hand") is reported in `run.errors` and not stored. A page that has an earlier snapshot is compared with the latest one: plans are matched by name, then each plan's card and the rest of the page are compared line by line. Each changed line is classified as price, limit, free plan, plan name, promotion marker or copy only, and only the changed lines are judged: one pricing item per plan that changed, with `before` and `after` in the page's words and `notes` naming the snapshot it was compared with and the kinds of lines that changed. Homepage changes, and pricing-page lines that are copy only, are skipped signals ("homepage copy, no action"); a page with no change at all is skipped as "nothing moved". A pricing page whose changes cannot be placed on a plan is reported as "page structure changed, check by hand" in `run.errors`, its snapshot is not stored, and no number is reported for it.

## Replay the stored snapshots

```sh
./run --replay --output result.json [--snapshots <dir>]
```

No browser, no network, no keys. For every watched page, the latest stored snapshot is compared with the one before it, exactly as a live run would; a page with one snapshot replays as its baseline. The tests replay pairs made of a real committed snapshot and an edited copy of it, described in `tests/fixtures/derived-snapshot-pairs/`; those copies are test fixtures, never written to `snapshots/`.

## The Monday run

`.github/workflows/scheduled-run.yml` runs `./run --live` on GitHub Actions every Monday at 08:30 Jerusalem time, and on demand from the Actions tab ("Run workflow") for demos and re-runs. GitHub schedules are in UTC, so the workflow fires at 05:30 and 06:30 UTC and a first job (`src/schedule/time-gate.ts`) lets through only the one that is 08:xx in `Asia/Jerusalem`; a manual run is never held back. Each run installs Chrome, captures the pages with a window on a virtual display, commits the new snapshots, `runs/result.json` and one line in `runs/run-log.jsonl` (start time, pages fetched, `cost_usd`, errors) as `github-actions[bot]`, and posts the run's one line to `#leadership` when the `SLACK_WEBHOOK_URL` secret is set (see below). Runs never overlap: a run started while one is going waits for it. A page a site blocks is reported in `run.errors` and the run log, never stored; capture it on a machine of your own with `./run --live` and commit the snapshot.

## The Slack line

Every run, from any command, renders one line for leadership in Maya's own style ("deck for 11:00, one pricing change flagged") and stores it in `result.json` under `slack`:

| Run | Line |
|---|---|
| Nothing moved | `pricing watch for 11:00: nothing moved since last week. details: <link>` |
| One change to respond to | `pricing watch for 11:00: one pricing change flagged (Lovable), it needs a response now. details: <link>` |
| Several, none to respond to | `pricing watch for 11:00: 3 pricing changes flagged (Replit, Bolt and Lovable), 2 still unconfirmed, no response needed yet. details: <link>` |
| First run | `pricing watch for 11:00: first look recorded for Lovable, Replit and Bolt, nothing to compare yet. details: <link>` |
| A page not read | `pricing watch for 11:00: no change found in what was read, but one problem stopped part of the run, so this is not the all-clear. details: <link>` |

The line is built from counts, actions and registered competitor names only: no quoted text, no confidence score, no price. The link is `DETAILS_URL` when it is set to an https link, otherwise Maya's sheet. With `SLACK_WEBHOOK_URL` set the line is posted to the channel the webhook belongs to; without it no poster is made and no network call happens. A failed post is added to `run.errors` with the reason ("Slack answered 404", "no answer from Slack"), never the webhook, and never stops the run.

## Proof

```sh
npm ci && npm test
```

Typechecks, runs the repo check for the brief's hidden markers, then the case suite (`cases/<name>/input.json` must give `cases/<name>/expected.json`) and the tests, including a replay of the committed snapshots. The capture test opens a local fixture page in the installed Chrome (no outside network) and is skipped where Chrome is not installed. CI runs it all on every push.

## Where the code lives

| Folder or file | What it owns |
|---|---|
| `src/cli.ts` | Parses the command line, reads the cases file, starts a live capture or a replay, writes `result.json`. Nothing else |
| `src/run.ts` | One run: input in, rules, in-run checks, result out. Orchestration only |
| `src/input/` | The two ways into a run. `parseCasesFile`: a cases file text into the run input (signals, banned words, secret-like config values, problems). `liveInput`: captured snapshots into the run input, one baseline signal per page seen for the first time, and the snapshot diff's signals (`snapshot-diff.ts`) for a page seen before |
| `src/capture/` | The live capture: Chrome opens each watched page and keeps its visible text; snapshots are stored and read back from `snapshots/`. `capture/index.ts` (`captureLiveInput`, `replayInput`) is the only import point |
| `src/judging/` | The rule engine (`runRules`), the rules (`RULES`), the source trust levels (`source-trust.ts`), reading a source as a URL (`source-url.ts`), the pricing item builder and the baseline rule; for a pricing item, its promotion markers (`promotion.ts`), the plan it is on (`plan.ts`), the action (`advice.ts`) and the Brightloop comparison (`comparison.ts`) |
| `src/checks/` | The in-run checks; `checks/index.ts` is the only import point |
| `src/config/` | The audience, the competitor registry, the known press outlets and where the Slack line links (`delivery.ts`) |
| `src/text/` | Reading outside text: named patterns, quoting, price change, the plans on a pricing page, the brief's markers |
| `src/domain/` | The shared types: `Signal`, `RunInput`, `Snapshot`, `Tier`, `Item`, `SkippedSignal`, `Result` |
| `src/schedule/` | The scheduled run: the 08:xx Jerusalem time gate and the run log |
| `src/report/` | The Slack line: `slackLine` renders it from a result, `deliverSlackLine` posts it when `SLACK_WEBHOOK_URL` is set; `report/index.ts` is the only import point |
| `runs/` | Written by the scheduled and manual runs: the latest `result.json` and `run-log.jsonl`, one line per run |
| `snapshots/` | The committed snapshots, one file per page per live run. Real data, replayed by the tests with no browser |

To add a judging rule: write the function in `src/judging/rules.ts`, put it in `JUDGING` (a rule that needs the whole batch, like `mergeDuplicates`, goes in `RULES` before the rules it feeds), and add a case under `cases/<name>/` (`input.json` and `expected.json`).

To add a source trust level: add a row to `TRUST_LEVELS` in `src/judging/source-trust.ts`, above the catch-all, and a case. To add a press outlet: one entry in `KNOWN_PRESS` in `src/config/press.ts`.

To add a competitor: add one entry to `COMPETITORS` in `src/config/competitors.ts`. The tests already loop over every entry; the next live run captures its pages.

## Output fields

The required wrapper (`built_for`, `items`, `skipped`, `run`) plus these fields on each item:

| Field | Meaning |
|---|---|
| `confidence_label` | The confidence in plain words, e.g. "confirmed: seen on Lovable's own pricing page", or "unconfirmed, possible promo: ..." when the rules cannot tell a promotion from a list-price change |
| `cta` | What Maya should do next |
| `competitor`, `page` | Which competitor and which of its pages |
| `what_changed`, `before`, `after` | The change as stated; `before` and `after` only when the signal states both and it is not a promotion or a possible one |
| `link` | The competitor's own pricing page |
| `notes` | Where the signal came from, and any promotion markers found |
| `brightloop_comparison` | Whether the competitor is still cheaper than Brightloop on that tier, or why that can't be said yet |
| `week` | The ISO week (`2026-W43`) the change was seen in, counted in the input's `timezone`; `null` when the signal has no readable time |
| `tiers` | Baseline items only: every plan on the pricing page, `{ name, price, period, struck_price, billing, limits }`, in the page's words; `billing` is null when the page does not say |

And one field next to the wrapper:

| Field | Meaning |
|---|---|
| `slack` | `{ line, status }`: the run's one Slack line (above) and what happened to it: `posted`, `not posted: no SLACK_WEBHOOK_URL` or `not posted: the post failed`. The run log (`runs/run-log.jsonl`) copies both as `slack_line` and `slack_status`, so the run history and the live page show the line as posted |
