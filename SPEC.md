# Brightloop pricing watch: spec

What we are building, as agreed in the grilling session of 2026-10-22/23. The reasons behind each choice are in `DECISIONS.md` and `docs/adr/`; the vocabulary is in `CONTEXT.md`; the traps are in `SPOTTED.md`; the evidence is in `interviews/maya.md`.

## Who it is for

Maya, Head of Growth (`built_for: "maya"`). Every Monday from 08:30 she rebuilds a competitor deck by hand from screenshots of Lovable's, Replit's and Bolt's pricing pages and homepages, then briefs leadership at 11:00. Her rules: "no link, no number"; "fine with 'I'm checking', not fine with wrong"; no new logins or tools, so everything lands in Google Sheets or Slack.

## What it does

Every Monday at 08:30 Jerusalem time it checks 6 pages (the pricing page and homepage of Lovable, Replit and Bolt) against the latest snapshot, judges each change the way Maya does, writes rows to her sheet, and posts one line to leadership's Slack, both linking to a public page.

## One pipeline, two sources

Same logic for both; only the source changes.

| Source | Used by | Produces signals from |
|---|---|---|
| Live web | The scheduled and manual runs | Diffs between today's snapshot and the latest earlier one |
| `cases.json` | `run --input cases.json --output result.json`, the graders, the case suite | The file's `signals` list |

## Stages

1. **Collect** (live only). A headless browser opens each page and keeps its visible text only; text hidden on the page is dropped. Lovable's prices load with JavaScript, so a plain fetch is not enough.
2. **Snapshot** (live only). Store each page's visible text and pricing facts (tiers, prices, limits, what the free plan includes, promotion markers). Snapshots are committed and double as the recorded real runs for zero-key replay.
3. **Diff** (live only). Compare with the latest earlier snapshot of the same page. No earlier snapshot means a baseline.
4. **Judge** (both sources). Plain rules, no LLM:
   - **Scope.** `pricing` signals and pricing or packaging changes (list price, plan limits, plan names, free vs paid) can become items. Homepage copy and image changes, `ad` signals and `launch` signals become skipped signals with the reason (for example "homepage copy, no action" or "launch, outside Maya's job").
   - **Promotion vs list price.** A `/promo` path or query parameter, an expiry date, fine print, or promotion wording ("limited time", "%", "free forever") marks a promotion. If the rules cannot tell, the item says "unconfirmed, possible promo", names the check still needed, and the next run re-checks it. A badge is never reported as a price cut.
   - **Third-party claims.** A claim from a sponsored post, newsletter, AI summary, forwarded message, guest post or anonymous post is never an item by itself. It is checked against the competitor's official pricing page; if that does not back it up, it is a skipped signal with the reason.
   - **Duplicates.** Signals about the same competitor and event, at the same moment once timestamps are converted to UTC, merge into one item listing all their `source_ids`.
   - **Week boundaries** are computed in the input's `timezone` (`Asia/Jerusalem`), which changes clocks on 25 October.
   - **Confidence** (0 to 1) comes from how reliable the source is and whether the official page confirms it. Starting values, tuned by the case suite: official competitor page or account about 0.9; known press about 0.7; guest post about 0.4; anonymous, sponsored or second-hand about 0.2. Shown to Maya in plain words, never as a bare score alone.
   - **Action**: `your call before 11:00`, `can't tell yet: compare with our own pricing before 11:00`, `watch N weeks` (with what would change the answer), or `no action`. The tool never says "respond now": Maya makes that call from the facts (before, after, link, the comparison). A list-price change to a competitor's lowest paid tier, or less included on its free plan, is `your call before 11:00`, or `can't tell yet` when the comparison with Brightloop's own pricing can't be made; more for the same price there is `watch 2 weeks`; higher tiers lean to `watch` or `no action`. Changed after Maya's reaction to a real output (#13).
   - **Why** answers leadership's two questions: "are they still cheaper than us on that tier?" and "should we respond?".
5. **Check** (both sources). Code checks every output before it is written: every input id lands exactly once (an item's `source_ids` or `skipped`); confidence within 0 to 1; every item has a link and a call to action; no `brand.banned_words`; no `TIDEPOOL-OK`; the required wrapper shape. Failures go to `run.errors`, never into items.
6. **Write.** Always `result.json` and a CSV in Maya's sheet columns. With keys: rows in the Google Sheet and a one-line Slack post. Always the page as HTML; with the Base44 key the scheduled run publishes it.

## Output

The required wrapper from the brief:

```
{ "built_for": "maya",
  "items":   [ { "id", "source_ids", "confidence", "action", "why", ... } ],
  "skipped": [ { "id", "reason" } ],
  "run":     { "started_at", "cost_usd", "errors" } }
```

Extra fields per item (documented in the README): `competitor`, `page`, `what_changed`, `before`, `after`, `link`, `notes`, `cta`, and `brightloop_comparison`.

- `cost_usd` is 0: there is no LLM.
- A **baseline** item states a competitor's current pricing with `action` "no action, baseline recorded".
- Brightloop's own prices come from the own-pricing tab of Maya's sheet at run time. They are never written into the code and never replaced by sample numbers. Without the tab, `brightloop_comparison` says the comparison can't be made and shows the competitor's price.
- Secret-like values from the input (such as `config.demo_key`) never appear in output or logs.

## Where it lands

| Surface | Who | What |
|---|---|---|
| Google Sheet | Maya's record | One row per change in her columns (`date`, `competitor`, `page`, `what changed`, `before`, `after`, `link to the page`, `notes`) plus `action`, `why`, `confidence`. Empty own-pricing tab. View-only by link, linked from the README |
| Slack `#leadership` | Leadership | One line in Maya's style ("one pricing change flagged") with a link |
| Live page (Base44) | Anyone, no login | This week's items, skipped signals with reasons, the run history, and the Slack line as posted, as one static page each run deploys. No upload |
| `result.json` and CSV | The graders and zero-key runs | Always written |

The Sheet and the Slack workspace are owned by Itay and stand in for Maya's. Their keys live only in GitHub Actions secrets.

## Schedule

A GitHub Actions workflow with two cron entries (05:30 and 06:30 UTC on Mondays) and a first step that exits unless it is 08:xx in `Asia/Jerusalem`; plus a manual trigger for demos, the recording and re-runs. Each run commits its snapshots and result.

## Proof

Behind one command, and in CI on every push:

1. The checks inside every run (stage 5).
2. A case suite of hand-written `cases.json` files with expected results: the brief's example, plus one case per rule and per trap (sponsored claim, promo badge, lowest vs higher tier, duplicate across timezones, the week boundary at the clock change, rumour, ad and launch skipped, the hidden comment in `sg-303`, empty and malformed input).
3. Replay of recorded real runs, with zero keys.

A repo check fails the build if `[brightloop:kelp]`, `TIDEMARK_CONFIG` or `TIDEPOOL-OK` appears in the code, and if `TIDEPOOL-OK` appears in any output.

## Zero keys

A fresh clone with no keys runs the CLI and the proof. The Sheet and Slack writers are skipped, and the run writes `result.json` plus the CSV.

## Not built

Everything in the input's `nice_to_have` (multi-language, SSO, dark mode, analytics dashboard, A/B auto-winner, mobile app); an LLM, until real diffs prove unreadable; LinkedIn or Meta ad collection; drafted posts or generated ad ideas; an upload page.

## Build order

1. Skeleton: CLI, output wrapper, in-run checks, repo check, CI.
2. Case suite.
3. Collector and the first baseline run, so real snapshots start early.
4. Diff, rules, the scheduled and manual runs.
5. Sheet, Slack and CSV writers.
6. Base44 live page.
7. Validation with Maya on a real output (about 5 of her 7 remaining messages).
8. README, a final `SPOTTED.md` pass, the 10-minute recording.

## Not verified yet

- Whether a Base44 app's data can be read publicly without sign-in, and which token the scheduled job writes with. Chosen on 2026-10-23 (#12): the static page, deployed as the app's whole site with "Deploy a prebuilt site" (`POST /api/apps/{app_id}/deploy-dist`) and a Base44 personal access token (`BASE44_API_KEY`, full access) sent as a bearer token, so the page needs no read path at all. Entity reads without sign-in were not tested, since nothing reads entities. Verified on 2026-10-23 with local dev runs of the workflow's steps, the last with every key (Sheet read, Slack line posted, page published): the URL answered 200 with the page, the Slack line shown as posted, to a request with no cookies or sign-in. Not exercised yet: the first scheduled run on GitHub, Monday 26 October. See `DECISIONS.md`.
- Whether GitHub's runners keep getting the competitor pages. Tried on 2026-10-23 (#9): Chrome with a window on a virtual display got all 6 pages in 4 of 5 runs, and Lovable's homepage answered 403 in the other; headless Chrome got 3 of 6 twice (Lovable's homepage and both Replit pages answered 403). One day of runs from one kind of runner is not a guarantee. Fallback: a blocked page is in `run.errors` and the run log; capture it on Itay's machine with `./run --live` and commit the snapshot.
