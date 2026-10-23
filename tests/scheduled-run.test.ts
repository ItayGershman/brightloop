import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { writeSnapshot } from "../src/capture/index.ts";
import type { WatchedPage } from "../src/domain/types.ts";
import { appendRunLog, runLogEntry } from "../src/schedule/run-log.ts";
import { localHour, shouldRun } from "../src/schedule/time-gate.ts";

const WORKFLOW = readFileSync(".github/workflows/scheduled-run.yml", "utf8");
const ZONE = "Asia/Jerusalem";

/** The workflow's cron lines, exactly as GitHub passes them in github.event.schedule. */
function cronLines(): string[] {
  return [...WORKFLOW.matchAll(/^\s*- cron: "([^"]+)"\s*$/gm)].map((match) => match[1]);
}

/** The moment a cron line ("30 5 * * 1") is due on a given day ("YYYY-MM-DD"), plus a delay. */
function due(cron: string, day: string, lateMinutes = 0): Date {
  const [minute, hour] = cron.split(" ").map(Number);
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour * 60 + minute + lateMinutes) * 60_000);
}

/** The cron lines that pass the gate when each starts on the day, the given minutes late. */
function running(day: string, lateMinutes = 0): string[] {
  return cronLines().filter((cron) => shouldRun({ event: "schedule", cron }, due(cron, day, lateMinutes)));
}

describe("the time gate", () => {
  test("the workflow has two Monday entries, at 05:30 and 06:30 UTC", () => {
    assert.deepEqual(cronLines(), ["30 5 * * 1", "30 6 * * 1"]);
  });

  // Israel goes back an hour at 02:00 on Sunday 25 October 2026 and forward an hour at
  // 02:00 on Friday 26 March 2027. The Mondays on each side of both changes:
  const MONDAYS: [string, string][] = [
    ["2026-10-19", "30 5 * * 1"], // summer time, UTC+3
    ["2026-10-26", "30 6 * * 1"], // winter time, UTC+2
    ["2027-03-22", "30 6 * * 1"], // winter time, UTC+2
    ["2027-03-29", "30 5 * * 1"], // summer time, UTC+3
  ];
  for (const [monday, expected] of MONDAYS) {
    test(`on Monday ${monday} exactly one entry runs, the one due at 08:30 in Jerusalem`, () => {
      assert.deepEqual(running(monday), [expected]);
      const moment = due(expected, monday);
      assert.equal(localHour(moment, ZONE), 8);
      assert.equal(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, weekday: "long" }).format(moment), "Monday");
    });

    test(`on Monday ${monday} a start 45 minutes late still runs exactly that entry`, () => {
      assert.deepEqual(running(monday, 45), [expected]);
    });
  }

  test("the gate reads the hour from the zone, not a fixed offset", () => {
    // At 02:00 summer time on 25 October the clock goes back to 01:00, so 01:30 happens twice.
    assert.equal(localHour(new Date("2026-10-24T22:30:00Z"), ZONE), 1); // UTC+3
    assert.equal(localHour(new Date("2026-10-24T23:30:00Z"), ZONE), 1); // UTC+2
    assert.equal(localHour(new Date("2026-10-25T00:30:00Z"), ZONE), 2);
  });

  test("without a readable cron line, the start time decides", () => {
    assert.equal(shouldRun({ event: "schedule" }, new Date("2026-10-26T06:40:00Z")), true);
    assert.equal(shouldRun({ event: "schedule", cron: "@weekly" }, new Date("2026-10-26T05:40:00Z")), false);
  });

  test("a manual run is never held back by the hour", () => {
    for (const cron of cronLines()) assert.equal(shouldRun({ event: "workflow_dispatch" }, due(cron, "2026-10-26")), true);
    assert.equal(shouldRun({ event: "workflow_dispatch" }, new Date("2026-10-23T22:15:00Z")), true);
  });

  test("the gate script writes run=false for the entry not due at 08:xx, run=true for the other", () => {
    const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "github-output");
    writeFileSync(output, "");
    for (const cron of cronLines()) {
      const gate = spawnSync("node_modules/.bin/tsx", ["scripts/schedule-gate.ts", "2026-10-26T06:50:00Z"], {
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_EVENT_NAME: "schedule", SCHEDULE: cron },
      });
      assert.equal(gate.status, 0, gate.stderr);
    }
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

  function workspace() {
    const dir = mkdtempSync(join(tmpdir(), "brightloop-"));
    const paths = { snapshots: join(dir, "snapshots"), result: join(dir, "result.json"), log: join(dir, "runs", "run-log.jsonl") };
    const entry = () => runLogEntry({ startedAt: START, resultPath: paths.result, snapshotsDir: paths.snapshots, pages: PAGES });
    return { ...paths, entry };
  }

  test("counts only the pages stored by this run, and copies cost and errors from the result", () => {
    const space = workspace();
    // An earlier run's snapshot of every page, then this run's of two of them.
    for (const page of PAGES) writeSnapshot(space.snapshots, { ...page, captured_at: "2026-10-19T05:30:20.000Z", lines: ["Pro"] });
    for (const page of PAGES.slice(0, 2)) writeSnapshot(space.snapshots, { ...page, captured_at: "2026-10-26T06:30:20.000Z", lines: ["Pro"] });
    const errors = ["Bolt pricing page: the site answered 403, so it was not captured"];
    writeFileSync(space.result, JSON.stringify({ built_for: "maya", items: [], skipped: [], run: { started_at: "x", cost_usd: 0, errors } }));

    assert.deepEqual(space.entry(), {
      started_at: "2026-10-26T06:30:05.000Z",
      pages_fetched: 2,
      pages_watched: 3,
      cost_usd: 0,
      errors,
      slack_line: null,
      slack_status: null,
    });
  });

  test("keeps the run's Slack line and whether it was posted", () => {
    const space = workspace();
    const slack = { line: "pricing watch for 11:00: nothing moved since last week. details: https://x.test/", status: "posted" };
    writeFileSync(space.result, JSON.stringify({ built_for: "maya", items: [], skipped: [], run: { started_at: "x", cost_usd: 0, errors: [] }, slack }));
    const entry = space.entry();
    assert.equal(entry.slack_line, slack.line);
    assert.equal(entry.slack_status, "posted");
  });

  test("a run that wrote no result still gets a line, saying so", () => {
    const entry = workspace().entry();
    assert.equal(entry.pages_fetched, 0);
    assert.equal(entry.cost_usd, null);
    assert.deepEqual(entry.errors, ["the run wrote no result.json"]);
  });

  test("a result.json that is not a result is reported, not trusted", () => {
    const space = workspace();
    writeFileSync(space.result, JSON.stringify({ run: { cost_usd: "free", errors: [] } }));
    assert.deepEqual(space.entry().errors, ["result.json could not be read"]);
    writeFileSync(space.result, "{ not json");
    assert.deepEqual(space.entry().errors, ["result.json could not be read"]);
  });

  test("each run appends one line and keeps the earlier ones", () => {
    const space = workspace();
    appendRunLog(space.log, space.entry());
    appendRunLog(space.log, { ...space.entry(), started_at: "2026-11-02T06:30:05.000Z" });
    const lines = readFileSync(space.log, "utf8").trimEnd().split("\n");
    assert.deepEqual(
      lines.map((line) => JSON.parse(line).started_at),
      ["2026-10-26T06:30:05.000Z", "2026-11-02T06:30:05.000Z"],
    );
  });
});
