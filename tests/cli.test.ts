import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Every command here runs with no Slack key, whatever the shell running the tests has set.
function cli(args: string[]) {
  return spawnSync("./run", args, { encoding: "utf8", env: { ...process.env, SLACK_WEBHOOK_URL: "" } });
}

test("a command without --output prints the usage line", () => {
  const run = cli(["--input", "cases/brief-example/input.json"]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /^usage: run --input/);
});

test("--output pointing at a directory prints the usage line, not a stack trace", () => {
  const dir = mkdtempSync(join(tmpdir(), "brightloop-"));
  const run = cli(["--input", "cases/brief-example/input.json", "--output", dir]);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--output must be a file path\nusage: run --input/);
  assert.doesNotMatch(run.stderr, /\bat .*\.ts:\d+/);
});

test("an input file that does not exist still writes a result, with the problem in run.errors", () => {
  const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
  const run = cli(["--input", "no-such-file.json", "--output", output]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /0 items, 0 skipped, 1 errors/);
});

test("with no Slack key, the Slack line is still written with the result and nothing is posted", () => {
  const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
  const run = cli(["--input", "cases/brief-example/input.json", "--output", output]);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(result.slack.status, "not posted: no SLACK_WEBHOOK_URL");
  assert.match(result.slack.line, /^pricing watch for 11:00: one pricing change flagged \(Lovable\)/);
  assert.match(run.stdout, /Slack line not posted: no SLACK_WEBHOOK_URL/);
});
