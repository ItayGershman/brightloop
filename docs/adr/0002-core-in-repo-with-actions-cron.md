# Core logic in the repo, run by a GitHub Actions cron

The brief's hardest gate is that the proof runs on a fresh clone with zero keys of the graders', using the same logic as the live app. So the whole pipeline is a Node/TypeScript program in this repo, with one entry point and two sources: the live web, or a `cases.json` file (`run --input cases.json --output result.json`). The weekly background run is a GitHub Actions cron that runs the same program every Monday early morning, Jerusalem time, before Maya's 11:00 meeting. The live URL is a small hosted page that only shows results; it holds no logic of its own.

## Considered Options

- **All in Base44** (backend functions, scheduled job, database, hosted page): built-in hosting and UI, and it uses the hiring company's product, but we could not confirm that its backend code runs locally from a clone with zero keys. If it does not, the CLI would need a second copy of the logic, breaking "same logic as the live app". Base44 can still host the results page.
- **A custom server** (a small Node service on a host like Render or Fly): one place for everything, but a server to run and pay for, and free-tier schedules are unreliable.
