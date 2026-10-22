import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

function cli(args: string[]) {
  return spawnSync("./run", args, { encoding: "utf8" });
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
