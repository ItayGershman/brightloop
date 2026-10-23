import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { writeSnapshot } from "../src/capture/snapshot-store.ts";
import type { WatchedPage } from "../src/domain/types.ts";
import { appendRunLog, runLogEntry } from "../src/schedule/run-log.ts";
import { localHour, shouldRun } from "../src/schedule/time-gate.ts";

const WORKFLOW = readFileSync(".github/workflows/scheduled-run.yml", "utf8");
const ZONE = "Asia/Jerusalem";

/** The workflow's cron entries as [minute, hour (UTC), weekday]. */
function cronEntries(): [number, number, number][] {
  return [...WORKFLOW.matchAll(/^\s*- cron: "(\d+) (\d+) \* \* (\d)"\s*$/gm)].map((match) => [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]);
}

/** The moments the cron entries fire on a given Monday (a "YYYY-MM-DD" date). */
function firings(monday: string): Date[] {
  return cronEntries().map(([minute, hour]) => new Date(`${monday}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`));
}

describe("the time gate", () => {
  test("the workflow has two Monday entries, at 05:30 and 06:30 UTC", () => {
    assert.deepEqual(cronEntries(), [
      [30, 5, 1],
      [30, 6, 1],
    ]);
  });

  // Israel goes back an hour at 02:00 on Sunday 25 October 2026 and forward an hour at
  // 02:00 on Friday 26 March 2027. The Mondays on each side of both changes:
  const MONDAYS: [string, string][] = [
    ["2026-10-19", "2026-10-19T05:30:00.000Z"], // summer time, UTC+3
    ["2026-10-26", "2026-10-26T06:30:00.000Z"], // winter time, UTC+2
    ["2027-03-22", "2027-03-22T06:30:00.000Z"], // winter time, UTC+2
    ["2027-03-29", "2027-03-29T05:30:00.000Z"], // summer time, UTC+3
  ];
  for (const [monday, expected] of MONDAYS) {
    test(`on Monday ${monday} exactly one entry runs, at 08:30 in Jerusalem`, () => {
      const running = firings(monday).filter((moment) => shouldRun("schedule", moment));
      assert.deepEqual(
        running.map((moment) => moment.toISOString()),
        [expected],
      );
      assert.equal(localHour(running[0], ZONE), 8);
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long" }).format(running[0]);
      assert.equal(weekday, "Monday");
    });
  }

  test("the gate reads the hour from the zone, not a fixed offset", () => {
    // At 02:00 summer time on 25 October the clock goes back to 01:00, so 01:30 happens twice.
    assert.equal(localHour(new Date("2026-10-24T22:30:00Z"), ZONE), 1); // UTC+3
    assert.equal(localHour(new Date("2026-10-24T23:30:00Z"), ZONE), 1); // UTC+2
    assert.equal(localHour(new Date("2026-10-25T00:30:00Z"), ZONE), 2);
  });

  test("a manual run is never held back by the hour", () => {
    for (const moment of firings("2026-10-26")) assert.equal(shouldRun("workflow_dispatch", moment), true);
    assert.equal(shouldRun("workflow_dispatch", new Date("2026-10-23T22:15:00Z")), true);
  });

  test("the gate script writes run=false for the entry that is not 08:xx", () => {
    const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "github-output");
    writeFileSync(output, "");
    const late = spawnSync("node_modules/.bin/tsx", ["scripts/schedule-gate.ts", "schedule", "2026-10-26T05:30:00Z"], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    assert.equal(late.status, 0, late.stderr);
    const due = spawnSync("node_modules/.bin/tsx", ["scripts/schedule-gate.ts", "schedule", "2026-10-26T06:30:00Z"], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: output },
    });
    assert.equal(due.status, 0, due.stderr);
    assert.equal(readFileSync(output, "utf8"), "run=false\nrun=true\n");
  });
});

describe("the run log", () => {
  const PAGES: WatchedPage[] = [
    { competitor: "Lovable", page: "pricing", url: "https://lovable.dev/pricing" },
    { competitor: "Lovable", page: "homepage", url: "https://lovable.dev/" },
    { competitor: "Bolt", page: "pricing", url: "https://bolt.new/pricing" },
  ];
  const START = new Date("2026-10-26T06:30:05.000Z");

  function workspace(): { dir: string; snapshots: string; result: string; log: string } {
    const dir = mkdtempSync(join(tmpdir(), "brightloop-"));
    return { dir, snapshots: join(dir, "snapshots"), result: join(dir, "result.json"), log: join(dir, "runs", "run-log.jsonl") };
  }

  test("counts only the pages stored by this run, and copies cost and errors from the result", () => {
    const paths = workspace();
    // An earlier run's snapshot of every page, then this run's of two of them.
    for (const page of PAGES) writeSnapshot(paths.snapshots, { ...page, captured_at: "2026-10-19T05:30:20.000Z", lines: ["Pro"] });
    for (const page of PAGES.slice(0, 2)) writeSnapshot(paths.snapshots, { ...page, captured_at: "2026-10-26T06:30:20.000Z", lines: ["Pro"] });
    const errors = ["Bolt pricing page: the site answered 403, so it was not captured"];
    writeFileSync(paths.result, JSON.stringify({ built_for: "maya", items: [], skipped: [], run: { started_at: "x", cost_usd: 0, errors } }));

    assert.deepEqual(runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES }), {
      started_at: "2026-10-26T06:30:05.000Z",
      pages_fetched: 2,
      pages_watched: 3,
      cost_usd: 0,
      errors,
    });
  });

  test("a run that wrote no result still gets a line, saying so", () => {
    const paths = workspace();
    const entry = runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES });
    assert.equal(entry.pages_fetched, 0);
    assert.equal(entry.cost_usd, null);
    assert.deepEqual(entry.errors, ["the run wrote no result.json"]);
  });

  test("a result.json that is not a result is reported, not trusted", () => {
    const paths = workspace();
    writeFileSync(paths.result, JSON.stringify({ run: { cost_usd: "free", errors: [] } }));
    const entry = runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES });
    assert.deepEqual(entry.errors, ["result.json could not be read"]);
    writeFileSync(paths.result, "{ not json");
    assert.deepEqual(runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES }).errors, [
      "result.json could not be read",
    ]);
  });

  test("each run appends one line and keeps the earlier ones", () => {
    const paths = workspace();
    const entry = runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES });
    appendRunLog(paths.log, entry);
    appendRunLog(paths.log, { ...entry, started_at: "2026-11-02T06:30:05.000Z" });
    const lines = readFileSync(paths.log, "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(
      lines.map((line) => JSON.parse(line).started_at),
      ["2026-10-26T06:30:05.000Z", "2026-11-02T06:30:05.000Z"],
    );
  });
});
