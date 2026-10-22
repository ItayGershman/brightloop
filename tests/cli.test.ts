import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("the brief's command writes result.json from the brief's example", () => {
  const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
  const cli = spawnSync("./run", ["--input", "cases/brief-example/input.json", "--output", output], { encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const result = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(result.built_for, "maya");
  assert.equal(result.items.length + result.skipped.length, 8);
  assert.match(cli.stdout, /2 items, 6 skipped, 0 errors/);
});

test("a missing --output is a usage error", () => {
  const cli = spawnSync("./run", ["--input", "cases/brief-example/input.json"], { encoding: "utf8" });
  assert.equal(cli.status, 2);
  assert.match(cli.stderr, /usage: run --input/);
});
