import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const WORKFLOW = readFileSync(".github/workflows/scheduled-run.yml", "utf8");
const EXAMPLE = readFileSync(".env.example", "utf8");

/** NAME='value' lines of .env.example. */
function exampleKeys(): Map<string, string> {
  return new Map([...EXAMPLE.matchAll(/^([A-Z0-9_]+)='([^']*)'$/gm)].map((match) => [match[1], match[2]]));
}

// The proof's own clean-copy test runs the suite where there is no git checkout.
const inGit = spawnSync("git", ["rev-parse", "--git-dir"]).status === 0;

test("git ignores .env and keeps .env.example", { skip: !inGit && "no git checkout" }, () => {
  const ignored = spawnSync("git", ["check-ignore", "-q", ".env"]);
  assert.equal(ignored.status, 0, ".env is ignored");
  const example = spawnSync("git", ["check-ignore", "-q", ".env.example"]);
  assert.equal(example.status, 1, ".env.example is not ignored");
});

test(".env.example names every key the workflow gives the run, with no secret value", () => {
  const keys = exampleKeys();
  for (const [, name, kind] of WORKFLOW.matchAll(/^\s+([A-Z0-9_]+): \$\{\{ (secrets|vars)\.\1 \}\}$/gm)) {
    assert.ok(keys.has(name), `${name} in .env.example`);
    if (kind === "secrets") assert.equal(keys.get(name), "", `${name} has no value`);
  }
});

test("the local run refuses --commit off main, before opening any page", () => {
  const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
  if (branch === "main") return;
  const run = spawnSync("scripts/local-run.sh", ["--commit"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--commit only on main/);
});
