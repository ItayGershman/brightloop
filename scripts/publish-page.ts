import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { AUDIENCE } from "../src/config/audience.ts";
import type { Result } from "../src/domain/types.ts";
import { deliverPage, publisherFromEnv } from "../src/page/index.ts";
import { readRunLog, runLogEntry } from "../src/schedule/run-log.ts";
import { repoProblems } from "./marker-scan.ts";

// Renders the live page from this run's result and the run log, writes it beside the result,
// and, with BASE44_API_KEY and BASE44_APP_ID set, publishes it to the Base44 app. It runs
// before this run's line is appended to the log, so the line is built here the same way and
// shown as the newest run; a failed publish is added to result.json's run.errors, so the run
// log line written next carries it. Never fails the job: the run's outputs still get committed.
// Usage: tsx scripts/publish-page.ts <started at, ISO> <result.json> <snapshots dir> <run log> <page.html>

const [startedAt, resultPath, snapshotsDir, logPath, pagePath] = process.argv.slice(2);
const start = new Date(startedAt ?? "");
if (!resultPath || !snapshotsDir || !logPath || !pagePath || Number.isNaN(start.getTime())) {
  console.error("usage: publish-page <started at> <result.json> <snapshots dir> <run log> <page.html>");
  process.exit(2);
}

const result = readResult(resultPath);
if (!result) {
  // The last published page stays up; the run log line says the run wrote no result.
  console.log("Live page: not updated, this run wrote no readable result.json.");
  process.exit(0);
}

const history = [...readRunLog(logPath), runLogEntry({ startedAt: start, resultPath, snapshotsDir })];
const delivered = await deliverPage(result, {
  pagePath,
  timeZone: AUDIENCE.timezone,
  history,
  publisher: publisherFromEnv(process.env),
  // The same scan the repo check runs on committed files, under a name it does not exempt.
  check: (html) => repoProblems([{ path: "live-page/index.html", text: html }]),
});
if (delivered.result !== result) writeFileSync(resultPath, `${JSON.stringify(delivered.result, null, 2)}\n`);
console.log(`Live page ${delivered.status}${delivered.url ? `: ${delivered.url}` : ""}. Wrote ${pagePath}.`);

function readResult(path: string): Result | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const written = JSON.parse(readFileSync(path, "utf8")) as Result;
    return Array.isArray(written.items) && Array.isArray(written.skipped) && Array.isArray(written.run?.errors) ? written : undefined;
  } catch {
    return undefined;
  }
}
