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

A manual run on a machine with Google Chrome installed. It opens the pricing page and homepage of every competitor in `src/config/competitors.ts`, keeps each page's visible text (text hidden on the page is dropped), stores one snapshot per page under `snapshots/<competitor>/<page>/<captured at>.json`, and runs the same judging and in-run checks as a cases file. A page with no earlier snapshot gives a baseline: one item per competitor with its plans, prices and limits, action "no action, baseline recorded"; homepages are recorded as skipped signals. Chrome opens a visible window, because some sites answer a headless browser with a bot check; `--headless` tries without one. `--snapshots <dir>` stores the snapshots elsewhere. Commit the new snapshots after a run. A blocked page, a bot-check page, or a pricing page with no readable plans ("page structure changed, check by hand") is reported in `run.errors` and not stored. Comparing a page with its earlier snapshot is not built yet: such a page is reported in `run.errors` too.

## The Monday run

`.github/workflows/scheduled-run.yml` runs `./run --live` on GitHub Actions every Monday at 08:30 Jerusalem time, and on demand from the Actions tab ("Run workflow") for demos and re-runs. GitHub schedules are in UTC, so the workflow fires at 05:30 and 06:30 UTC and a first job (`src/schedule/time-gate.ts`) lets through only the one that is 08:xx in `Asia/Jerusalem`; a manual run is never held back. Each run installs Chrome, captures the pages with a window on a virtual display, commits the new snapshots, `runs/result.json` and one line in `runs/run-log.jsonl` (start time, pages fetched, `cost_usd`, errors) as `github-actions[bot]`, and needs no secret. Runs never overlap: a run started while one is going waits for it. A page a site blocks is reported in `run.errors` and the run log, never stored; capture it on a machine of your own with `./run --live` and commit the snapshot.

## Proof

```sh
npm ci && npm test
```

Typechecks, runs the repo check for the brief's hidden markers, then the case suite (`cases/<name>/input.json` must give `cases/<name>/expected.json`) and the tests, including a replay of the committed snapshots. The capture test opens a local fixture page in the installed Chrome (no outside network) and is skipped where Chrome is not installed. CI runs it all on every push.

## Where the code lives

| Folder or file | What it owns |
|---|---|
| `src/cli.ts` | Parses the command line, reads the cases file or starts a live capture, writes `result.json`. Nothing else |
| `src/run.ts` | One run: input in, rules, in-run checks, result out. Orchestration only |
| `src/input/` | The two ways into a run. `parseCasesFile`: a cases file text into the run input (signals, banned words, secret-like config values, problems). `liveInput`: captured snapshots into the run input, one baseline signal per page seen for the first time |
| `src/capture/` | The live capture: Chrome opens each watched page and keeps its visible text; snapshots are stored and read back from `snapshots/`. `capture/index.ts` (`captureLiveInput`) is the only import point |
| `src/judging/` | The rule engine (`runRules`), the rules (`RULES`), the source trust levels (`source-trust.ts`), reading a source as a URL (`source-url.ts`), the pricing item builder and the baseline rule; for a pricing item, its promotion markers (`promotion.ts`), the plan it is on (`plan.ts`), the action (`advice.ts`) and the Brightloop comparison (`comparison.ts`) |
| `src/checks/` | The in-run checks; `checks/index.ts` is the only import point |
| `src/config/` | The audience, the competitor registry and the known press outlets |
| `src/text/` | Reading outside text: named patterns, quoting, price change, the plans on a pricing page, the brief's markers |
| `src/domain/` | The shared types: `Signal`, `RunInput`, `Snapshot`, `Tier`, `Item`, `SkippedSignal`, `Result` |
| `src/schedule/` | The scheduled run: the 08:xx Jerusalem time gate and the run log |
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
