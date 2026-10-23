# Brightloop pricing watch

A competitor pricing watch for Maya, Head of Growth at Brightloop. The spec is in `SPEC.md`, the decision log in `DECISIONS.md`.

## Run it on a cases file

```sh
./run --input cases.json --output result.json
```

Needs Node 18 or later. On first use the script installs the pinned dev dependencies. No keys are needed.

## Proof

```sh
npm ci && npm test
```

Typechecks, runs the repo check for the brief's hidden markers, then the case suite (`cases/<name>/input.json` must give `cases/<name>/expected.json`) and the tests. CI runs it on every push.

## Where the code lives

| Folder or file | What it owns |
|---|---|
| `src/cli.ts` | Parses the command line, reads the cases file, writes `result.json`. Nothing else |
| `src/run.ts` | One run: input in, rules, in-run checks, result out. Orchestration only |
| `src/input/` | `parseCasesFile`: a cases file text into the run input (signals, banned words, secret-like config values, problems) |
| `src/judging/` | The rule engine (`runRules`), the rules (`RULES`), the source trust levels (`source-trust.ts`), reading a source as a URL (`source-url.ts`) and the pricing item builder |
| `src/checks/` | The in-run checks; `checks/index.ts` is the only import point |
| `src/config/` | The audience, the competitor registry and the known press outlets |
| `src/text/` | Reading outside text: named patterns, quoting, price change, the brief's markers |
| `src/domain/` | The shared types: `Signal`, `RunInput`, `Item`, `SkippedSignal`, `Result` |

To add a judging rule: write the function in `src/judging/rules.ts`, put it in `JUDGING` (a rule that needs the whole batch, like `mergeDuplicates`, goes in `RULES` before the rules it feeds), and add a case under `cases/<name>/` (`input.json` and `expected.json`).

To add a source trust level: add a row to `TRUST_LEVELS` in `src/judging/source-trust.ts`, above the catch-all, and a case. To add a press outlet: one entry in `KNOWN_PRESS` in `src/config/press.ts`.

To add a competitor: add one entry to `COMPETITORS` in `src/config/competitors.ts`. The tests already loop over every entry.

## Output fields

The required wrapper (`built_for`, `items`, `skipped`, `run`) plus these fields on each item:

| Field | Meaning |
|---|---|
| `confidence_label` | The confidence in plain words, e.g. "confirmed: seen on Lovable's own pricing page" |
| `cta` | What Maya should do next |
| `competitor`, `page` | Which competitor and which of its pages |
| `what_changed`, `before`, `after` | The change as stated; `before` and `after` only when the signal states both |
| `link` | The competitor's own pricing page |
| `notes` | Where the signal came from |
| `brightloop_comparison` | Whether the competitor is still cheaper than Brightloop on that tier, or why that can't be said yet |
| `week` | The ISO week (`2026-W43`) the change was seen in, counted in the input's `timezone`; `null` when the signal has no readable time |
