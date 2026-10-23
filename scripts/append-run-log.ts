import { appendRunLog, runLogEntry } from "../src/schedule/run-log.ts";

// Appends this run's line to the run log, whether or not the run finished.
// Usage: tsx scripts/append-run-log.ts <started at, ISO> <result.json> <snapshots dir> <run log>

const [startedAt, resultPath, snapshotsDir, logPath] = process.argv.slice(2);
const start = new Date(startedAt ?? "");
if (!resultPath || !snapshotsDir || !logPath || Number.isNaN(start.getTime())) {
  console.error("usage: append-run-log <started at> <result.json> <snapshots dir> <run log>");
  process.exit(2);
}
const entry = runLogEntry({ startedAt: start, resultPath, snapshotsDir });
appendRunLog(logPath, entry);
console.log(`Run log: ${entry.pages_fetched} of ${entry.pages_watched} pages fetched, ${entry.errors.length} errors.`);
