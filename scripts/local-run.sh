#!/bin/sh
# The scheduled workflow's run job on a developer machine (local dev, demos, re-runs):
# the live run (Sheet rows and the Slack line), the live page, the run log and the repo
# checks, in the workflow's order. Keys come from .env (see .env.example; git ignores .env),
# read as data and never run as shell; each step gets only its own keys, as in the workflow,
# even when the shell running this has some of them exported. A key left empty skips its
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

BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || echo "no branch")
if [ "$COMMIT" = true ] && [ "$BRANCH" != main ]; then
  echo "local-run: --commit only on main (this is $BRANCH): a run's snapshots would change what the tests replay here." >&2
  exit 2
fi

KEYS="GOOGLE_SERVICE_ACCOUNT_JSON SHEET_ID SLACK_WEBHOOK_URL DETAILS_URL BASE44_API_KEY BASE44_APP_ID"
for name in $KEYS; do unset "$name"; done

# .env is read as data, never run: only NAME=value lines for the names above, one quote pair
# around the value dropped. Anything else in it is ignored.
if [ -f .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    name=${line%%=*}
    case " $KEYS " in *" $name "*) ;; *) continue ;; esac
    value=${line#*=}
    case "$value" in
      \'*\') value=${value#\'}; value=${value%\'} ;;
      \"*\") value=${value#\"}; value=${value%\"} ;;
    esac
    eval "$name=\$value"
  done < .env
else
  echo "local-run: no .env, so this is a zero-key run (copy .env.example to .env to add keys)."
fi
for name in $KEYS; do
  eval "value=\${$name:-}"
  [ -n "$value" ] && echo "  $name: set" || echo "  $name: empty"
done

# Runs a step with no key at all except the ones named: none of them is exported to this script.
with_keys() {
  given=""
  while [ "$1" != "--" ]; do
    eval "given=\"\$given $1=\\\"\\\${$1:-}\\\"\""
    shift
  done
  shift
  eval "env -u GOOGLE_SERVICE_ACCOUNT_JSON -u SHEET_ID -u SLACK_WEBHOOK_URL -u DETAILS_URL -u BASE44_API_KEY -u BASE44_APP_ID $given \"\$@\""
}

START=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "Run started at $START on $BRANCH."
status=0

# Live run. The last run's result goes first, so a crash cannot pass it off as this run's.
rm -f runs/result.json runs/result.csv runs/result.html
with_keys GOOGLE_SERVICE_ACCOUNT_JSON SHEET_ID SLACK_WEBHOOK_URL DETAILS_URL -- ./run --live --output runs/result.json $HEADLESS || status=$?

# The page goes public, so the outputs are checked first; a failure stops here.
with_keys -- npm run --silent repo-check
with_keys BASE44_API_KEY BASE44_APP_ID -- ./node_modules/.bin/tsx scripts/publish-page.ts "$START" runs/result.json snapshots runs/run-log.jsonl runs/result.html || true
with_keys -- ./node_modules/.bin/tsx scripts/append-run-log.ts "$START" runs/result.json snapshots runs/run-log.jsonl
with_keys -- npm run --silent repo-check

if [ "$COMMIT" = true ]; then
  git add snapshots runs
  git commit -m "local run at $START"
  git pull --rebase origin main
  git push origin HEAD:main
fi
exit "$status"
