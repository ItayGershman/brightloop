import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { run } from "../src/run.ts";
import { fileSource } from "../src/source.ts";

// The case suite: every cases/<name>/input.json must produce cases/<name>/expected.json.

for (const name of readdirSync("cases")) {
  test(`case ${name} gives its expected result`, () => {
    const expected = JSON.parse(readFileSync(`cases/${name}/expected.json`, "utf8"));
    const result = run(fileSource(readFileSync(`cases/${name}/input.json`, "utf8")), {
      startedAt: new Date(expected.run.started_at),
    });
    assert.deepEqual(result, expected);
  });
}
