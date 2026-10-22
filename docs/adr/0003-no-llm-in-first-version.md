# No LLM in the first version

The graders run hidden cases on a fresh clone with zero keys of theirs, so judging (scope, promotion vs list price, confidence, action, why) has to work without an LLM on text it has never seen; recorded LLM answers cannot cover unseen cases. That left one possible LLM job, reading prices out of messy pricing pages, and it has a plain alternative: a headless browser takes each page's visible text, the run diffs it line by line against last week's copy, and rules classify each changed line (price, limit, free plan, plan name, promotion marker, or copy only). Before and after values come straight from the diff, so nothing is generated. An LLM is added later only if real diffs turn out unreadable.

## Considered Options

- **LLM extraction in the live collector only**, replayed from snapshots without keys: more robust to scattered layouts, but a cost and a second moving part for a job the diff already does.
- **LLM writes `why` and picks `action`**: nicer wording, but it cannot run in the zero-key hidden test, which would force a second rule path and break "same logic as the live app", and it exposes the run to instructions hidden in signal text (see `SPOTTED.md`, trap 3).

## Consequences

- A headless browser is needed anyway: Lovable's pricing page shows no prices until JavaScript runs (checked 2026-10-23; Replit's and Bolt's show prices in the raw page).
- Runs cost $0 and are fully repeatable.
- When a page is redesigned and the rules cannot place a change, the run reports it in `run.errors` ("page structure changed, check by hand") instead of guessing a number.
