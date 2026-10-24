# Architecture: one run, from the Monday cron to Maya's Sheet

Three sequence diagrams, traced from the code (`src/cli.ts`, `src/run.ts`, `.github/workflows/scheduled-run.yml`), not from the spec. The first two are the Monday run, split where `./run` hands its result to the rest of the workflow. The third shows that a grader's cases file and a replay reach the same `run()`.

Names follow `CONTEXT.md`: a **snapshot** is one page's visible text from one run, a **signal** is one observed change, an **item** is a recommendation to Maya, a **skipped signal** is one that became no item, with the reason.

Rendered copies for slides and the recording: [part A](architecture-monday-capture.svg), [part B](architecture-monday-deliver.svg), [one pipeline](architecture-one-pipeline.svg). Regenerate them when a diagram changes.

How to read them: `opt` is a step that happens only when its keys are set; `alt` is a branch, and a red note is a failure that goes to `run.errors` instead of crashing. Without any key, every `opt` box is skipped and the run still writes its files.

---

## 1. Monday run, part A: capture the pages and judge them

```mermaid
sequenceDiagram
    autonumber
    participant Cron as GitHub Actions cron
    participant Gate as Time gate
    participant CLI as ./run --live
    participant Chrome as Chrome (capture)
    participant Snaps as snapshots/
    participant Diff as Snapshot diff
    participant Sheet as Maya's Sheet
    participant Run as run()

    Cron->>Gate: Monday, 05:30 and 06:30 UTC
    Gate-->>Cron: run=true only at 08:xx Jerusalem
    Cron->>CLI: xvfb-run ./run --live
    CLI->>Snaps: read the latest snapshot of each page
    loop 6 pages: 3 competitors, pricing page and homepage
        CLI->>Chrome: open the page, wait for its scripts
        Note over Chrome: Untrusted text enters here.<br/>Hidden text is blanked inside the page,<br/>only visible lines come back, as data.
        alt blocked, bot check or timeout
            Chrome-->>CLI: error line, to run.errors
        else loaded
            Chrome-->>CLI: visible lines
        end
    end
    CLI->>Diff: new snapshot vs the latest earlier one
    alt no earlier snapshot
        Diff-->>CLI: baseline signal
    else plans changed
        Diff-->>CLI: one pricing signal per changed plan
    else change cannot be placed on a plan
        Diff-->>CLI: "page structure changed", to run.errors
    end
    CLI->>Snaps: store the new snapshots it could read
    opt GOOGLE_SERVICE_ACCOUNT_JSON and SHEET_ID set
        CLI->>Sheet: read the own-pricing tab
        Sheet-->>CLI: Brightloop tiers and prices
        Note over CLI,Sheet: Unreadable tab: run.errors, exit 1 later,<br/>items say "can't compare"
    end
    CLI->>Run: run(input)
    Run-->>CLI: result: items, skipped, run.errors
```

**Read aloud:**

1. GitHub fires the workflow twice every Monday morning, because Israel changes clocks; a small time gate lets only the 08:30 Jerusalem one through.
2. The run opens six public pages in a real Chrome: the pricing page and homepage of Lovable, Replit and Bolt. Chrome is needed because Lovable's prices only appear after JavaScript runs.
3. This is where outside text enters the tool. Anything a person cannot see on the page is blanked before the text is read, and what is left is only ever data, never instructions.
4. Each page is compared with last week's snapshot. A first look is a baseline; a changed plan becomes a pricing signal; a change the tool cannot place on a plan becomes an error that says "check by hand", never a guessed number.
5. With the Sheet keys, Brightloop's own prices are read from Maya's own-pricing tab at run time. Without them, items say the comparison can't be made.
6. Everything then goes into one function, `run()`, the same one the graders run.

**Why this shape:**

- A scheduled GitHub Action instead of a server or Base44 backend functions: the graders must run the same logic from a fresh clone with zero keys (ADR 0002).
- A real browser and a line diff instead of an LLM reading the page: no cost, nothing a hidden instruction can talk to, and the zero-key hidden tests still pass (ADR 0003).
- Page text is data, and hidden text is stripped before anything reads it: the brief itself plants hidden instructions (ADR 0001).
- Two cron lines and a gate: GitHub schedules are UTC only, and the clocks change on 25 October (DECISIONS, 2026-10-23, scheduled run).
- A page the tool can't read gives no snapshot, so next week compares against the last good one (DECISIONS, 2026-10-23, page structure changed).
- Own prices come from Maya's Sheet at run time, never from the code (DECISIONS, 2026-10-22, own prices).

---

## 2. Monday run, part B: deliver the result and record the run

```mermaid
sequenceDiagram
    autonumber
    participant CLI as ./run --live
    participant Sheet as Maya's Sheet
    participant Files as runs/ files
    participant Slack as Slack leadership
    participant WF as Workflow steps
    participant Base44 as Base44 live page
    participant Log as Run log
    participant Git as Repo

    opt Sheet keys set
        CLI->>Sheet: append rows not already there this week
        Note over CLI,Sheet: Sheet fails: run.errors, rows still in the CSV
    end
    CLI->>Files: result.json and result.csv
    opt SLACK_WEBHOOK_URL set, and something moved
        CLI->>Slack: one line, links to the Sheet
        Note over CLI,Slack: Post fails: run.errors
    end
    CLI->>Files: result.json with the Slack line, result.html
    WF->>WF: repo check on snapshots and result
    alt forbidden marker found
        Note over WF,Git: Page not published, no commit, job red
    else clean
        WF->>Files: render the page with the run history
        opt BASE44_API_KEY and BASE44_APP_ID set
            WF->>Base44: deploy the static page
            Note over WF,Base44: Upload fails: run.errors,<br/>last page stays up
        end
        WF->>Log: append one line for this run
        WF->>WF: repo check again
        WF->>Git: bot commit: snapshots and runs/
    end
```

**Read aloud:**

1. With the Sheet keys, the run appends one row per change to Maya's Sheet. A re-run in the same week skips rows that are already there.
2. `result.json` and a CSV with the same rows are written first, before anything is posted, so a posted line is never left unstored.
3. With the Slack key, one line goes to leadership. A quiet week is stored but not posted: Maya said leadership doesn't need a "nothing happened" ping.
4. Before anything goes public, a repo check scans the snapshots and the result for the brief's forbidden markers. If it finds one, nothing is published and nothing is committed.
5. Then the live page is rendered with the run history and, with the Base44 keys, deployed to the Base44 app as a static page.
6. Every failure on the way, Sheet, Slack or Base44, lands in `run.errors` and in the run log line. Nothing crashes the run, but a Sheet failure turns the job red.
7. Last, the bot commits the new snapshots, the result and the run log, so next week has something to compare against, and every run is a recorded run the graders can replay.

**Why this shape:**

- Every surface is optional and named by its keys: a fresh clone with no keys still writes `result.json`, the CSV and the page (SPEC, Zero keys; ADR 0002).
- Each step gets only its own keys, in the workflow and in `scripts/local-run.sh` (DECISIONS, 2026-10-23, local dev run).
- Failures go to `run.errors`, never into items and never a crash (ADR 0001; DECISIONS, 2026-10-23, in-run checks).
- Repo check before the page goes up, and again before the commit: the page is public (DECISIONS, 2026-10-23, review of the live page).
- A static page deployed each run, not a Base44 page reading entities: one source of truth, the committed result (DECISIONS, 2026-10-23, live page #12).
- No Slack ping on a quiet week, and the tool never says "respond now", only "your call before 11:00" (DECISIONS, 2026-10-24).
- Committed snapshots double as the replay fixtures (SPEC, Stages 2).

---

## 3. One pipeline, two sources: every way in reaches the same run()

```mermaid
sequenceDiagram
    autonumber
    participant Grader as ./run --input
    participant Replay as ./run --replay
    participant Input as Run input
    participant Run as run()
    participant Rules as Judging rules
    participant Checks as In-run checks
    participant Out as result files

    Grader->>Input: parseCasesFile: no network, no keys
    Note over Grader,Input: Signal text is data. A bad file gives<br/>run.errors, never a crash. Config values<br/>named key or token become secrets.
    Replay->>Input: latest two snapshots per page, same diff as live
    Note over Replay,Input: No browser, no keys. ./run --live<br/>builds its input the same way (diagram 1).
    Input->>Run: one run input: signals, secrets, timezone
    Run->>Rules: duplicates, scope, baseline, pricing
    Rules-->>Run: each signal: part of an item, or skipped with a reason
    loop each item
        Run->>Checks: link, call to action, confidence, banned words
        alt check fails
            Note over Run,Checks: run.errors, its signals go to skipped
        end
    end
    Run->>Checks: every input id lands exactly once
    Run->>Checks: forbidden values: secrets, markers
    alt forbidden value found
        Note over Run,Checks: items and skipped emptied, run.errors
    end
    Run-->>Out: result
    Note over Checks,Out: Only --live with keys touches<br/>the Sheet, Slack or Base44.<br/>These write files only.
```

**Read aloud:**

1. There is one entry point, `./run`, and three ways to feed it: a cases file, stored snapshots, or the live web.
2. The graders' path is `./run --input cases.json --output result.json`. It needs no keys and makes no network call, and it writes `result.json`, `result.csv` and `result.html`.
3. A replay reads the two latest stored snapshots of each page and diffs them exactly like the live run, without opening a browser.
4. All three become the same run input and go through the same `run()`: no second copy of the logic for tests.
5. Inside `run()`, an ordered list of plain rules decides each signal: duplicates first, then scope, baseline and pricing.
6. Code then checks every output before it is written. An item that fails is held back with the reason, every input id must land exactly once, and a secret or forbidden marker empties the output rather than leak.

**Why this shape:**

- One `run()` for every source, so the hidden tests prove the live app's logic (SPEC, One pipeline, two sources; ADR 0002).
- Rules, not an LLM, so unseen cases work with zero keys and `cost_usd` is 0 (ADR 0003).
- Code validates every output; a failure is a run error, not an item (ADR 0001).
- Judging is an ordered list of rules, duplicates first (DECISIONS, 2026-10-23, `RULES` and `mergeDuplicates`).
- Config values whose name says key, token, secret or password are treated as secrets and never written (DECISIONS, 2026-10-23, secrets).
- Replay is the live diff on stored snapshots, so the recorded real runs are part of the proof (DECISIONS, 2026-10-23, replay).

---

## Where keys are needed, and what happens without them

| Key | Step | Without it |
|---|---|---|
| none | `./run --input`, `./run --replay`, the proof | Always works: `result.json`, `result.csv`, `result.html` |
| Chrome installed | `./run --live` capture | "could not start Google Chrome", in `run.errors` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` and `SHEET_ID` | read own pricing, append rows | Rows in the CSV only, items say "can't compare" |
| `SLACK_WEBHOOK_URL` | post the line | Line stored, status `not posted: no SLACK_WEBHOOK_URL` |
| `BASE44_API_KEY` and `BASE44_APP_ID` | publish the page | Page written to `runs/result.html` only |

## Where outside text enters, and how it stays data

| Entry | Guard | Code |
|---|---|---|
| Competitor pages | Hidden text blanked inside the page, bot-check pages never stored | `src/capture/visible-lines.ts`, `src/capture/capture-pages.ts` |
| Cases file | Errors name a position, never the raw id, credential values become secrets | `src/input/parse-cases-file.ts` |
| Signal source | Trust read from visible text only, comments and tags dropped | `src/judging/source-trust.ts` |
| Every output | In-run checks, forbidden values empty the result | `src/checks/index.ts`, `src/run.ts` |
| Before publish and commit | Repo check for the brief's markers | `scripts/repo-check.ts`, `.github/workflows/scheduled-run.yml` |
