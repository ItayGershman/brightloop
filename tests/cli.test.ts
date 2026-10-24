import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

test("a cases-file run writes the Slack line with the result and posts nothing", () => {
  const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
  const run = cli(["--input", "cases/brief-example/input.json", "--output", output]);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(result.slack.status, "not posted: only a live run posts");
  assert.match(result.slack.line, /^pricing watch for 11:00: one pricing change flagged \(Lovable\)/);
  assert.match(run.stdout, /Slack line not posted: only a live run posts/);
});

test("a secret-like config value never reaches the printed lines or any file the run writes", () => {
  const input = JSON.parse(readFileSync("cases/secret-in-signal/input.json", "utf8"));
  const secret: string = input.config.demo_key;
  const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
  const run = cli(["--input", "cases/secret-in-signal/input.json", "--output", output]);
  assert.equal(run.status, 0, run.stderr);
  for (const [where, text] of [
    ["stdout", run.stdout],
    ["stderr", run.stderr],
    ["result.json", readFileSync(output, "utf8")],
    ["result.csv", readFileSync(output.replace(/\.json$/, ".csv"), "utf8")],
    ["result.html", readFileSync(output.replace(/\.json$/, ".html"), "utf8")],
  ]) {
    assert.ok(!text.includes(secret), `${where} contains the secret`);
  }
});

test("--output may climb out of the working folder with ..", () => {
  const root = mkdtempSync(join(tmpdir(), "brightloop-"));
  const work = join(root, "work");
  mkdirSync(work);
  const run = spawnSync(resolve("run"), ["--input", resolve("cases/brief-example/input.json"), "--output", "../x/result.json"], {
    cwd: work,
    encoding: "utf8",
    env: { ...process.env, SLACK_WEBHOOK_URL: "" },
  });
  assert.equal(run.status, 0, run.stderr);
  for (const name of ["result.json", "result.csv", "result.html"]) assert.ok(existsSync(join(root, "x", name)), name);
});

test("an --output folder that cannot be written says so, not that the path is wrong", { skip: process.getuid?.() === 0 }, () => {
  const locked = join(mkdtempSync(join(tmpdir(), "brightloop-")), "locked");
  mkdirSync(locked, { mode: 0o555 });
  const run = cli(["--input", "cases/brief-example/input.json", "--output", join(locked, "result.json")]);
  chmodSync(locked, 0o755);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /could not write .*result\.json: permission denied/);
  assert.doesNotMatch(run.stderr, /must be a file path/);
});
