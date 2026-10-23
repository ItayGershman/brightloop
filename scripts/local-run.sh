#!/bin/sh
# The scheduled workflow's run job, on this machine, for when GitHub Actions cannot run it:
# the live run (Sheet rows and the Slack line), the live page, the run log and the repo
# checks, in the workflow's order. Keys come from .env (see .env.example; git ignores .env)
# and each step gets only its own keys, as in the workflow; a key left empty skips its
# surface. Nothing here prints a key.
# With --commit, it then commits the snapshots and runs/ and pushes, as the workflow does;
# only on main, because a run's snapshots change what the replay tests read on any other branch.
# Usage: scripts/local-run.sh [--commit] [--headless]
set -eu
cd "$(dirname "$0")/.."

COMMIT=false
HEADLESS=""
for arg in "$@"; do
  case "$arg" in
    --commit) COMMIT=true ;;
    --headless) HEADLESS="--headless" ;;
    *) echo "usage: scripts/local-run.sh [--commit] [--headless]" >&2; exit 2 ;;
  esac
done

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no git checkout")
if [ "$COMMIT" = true ] && [ "$BRANCH" != main ]; then
  echo "local-run: --commit only on main (this is $BRANCH): a run's snapshots would change what the tests replay here." >&2
  exit 2
fi

GOOGLE_SERVICE_ACCOUNT_JSON="" SHEET_ID="" SLACK_WEBHOOK_URL="" DETAILS_URL="" BASE44_API_KEY="" BASE44_APP_ID=""
if [ -f .env ]; then
  # Read as shell assignments into this script only; nothing is exported to every step.
  . ./.env
else
  echo "local-run: no .env, so this is a zero-key run (copy .env.example to .env to add keys)."
fi
for name in GOOGLE_SERVICE_ACCOUNT_JSON SHEET_ID SLACK_WEBHOOK_URL BASE44_API_KEY BASE44_APP_ID; do
  eval "value=\${$name}"
  [ -n "$value" ] && echo "  $name: set" || echo "  $name: empty"
done

START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Run started at $START on $BRANCH."
status=0

# Live run. The last run's result goes first, so a crash cannot pass it off as this run's.
rm -f runs/result.json runs/result.csv runs/result.html
GOOGLE_SERVICE_ACCOUNT_JSON="$GOOGLE_SERVICE_ACCOUNT_JSON" SHEET_ID="$SHEET_ID" SLACK_WEBHOOK_URL="$SLACK_WEBHOOK_URL" DETAILS_URL="$DETAILS_URL" \
  ./run --live --output runs/result.json $HEADLESS || status=$?

# The page goes public, so the outputs are checked first; a failure stops here.
npm run --silent repo-check
BASE44_API_KEY="$BASE44_API_KEY" BASE44_APP_ID="$BASE44_APP_ID" \
  ./node_modules/.bin/tsx scripts/publish-page.ts "$START" runs/result.json snapshots runs/run-log.jsonl runs/result.html || true
./node_modules/.bin/tsx scripts/append-run-log.ts "$START" runs/result.json snapshots runs/run-log.jsonl
npm run --silent repo-check

if [ "$COMMIT" = true ]; then
  git add snapshots runs
  git commit -m "local run at $START"
  git pull --rebase origin main
  git push origin HEAD:main
fi
exit "$status"
