import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  // The same lookup as the script's: on main the script would start a real live run, so the test stops.
  const branch = spawnSync("git", ["symbolic-ref", "--short", "HEAD"], { encoding: "utf8" }).stdout.trim();
  if (branch === "main") return;
  const run = spawnSync("scripts/local-run.sh", ["--commit"], { encoding: "utf8" });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--commit only on main/);
});

/** A copy of the local run in an empty git repo, with every step replaced by one that prints the keys it was given. */
function stubbedCheckout(envFile: string): { dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), "brightloop-local-"));
  mkdirSync(join(dir, "scripts"));
  mkdirSync(join(dir, "node_modules", ".bin"), { recursive: true });
  mkdirSync(join(dir, "bin"));
  copyFileSync("scripts/local-run.sh", join(dir, "scripts", "local-run.sh"));
  const show = `#!/bin/sh\necho "[$(basename "$0") $1] $(env | grep -E '^(${KEY_NAMES.join("|")})=' | cut -d= -f1 | sort | tr '\\n' ' ')"\n`;
  for (const stub of ["run", "node_modules/.bin/tsx", "bin/npm"]) {
    writeFileSync(join(dir, stub), show);
    chmodSync(join(dir, stub), 0o755);
  }
  writeFileSync(join(dir, ".env"), envFile);
  spawnSync("git", ["init", "-q"], { cwd: dir });
  return { dir, path: `${join(dir, "bin")}:${process.env.PATH}` };
}

const KEY_NAMES = ["GOOGLE_SERVICE_ACCOUNT_JSON", "SHEET_ID", "SLACK_WEBHOOK_URL", "DETAILS_URL", "BASE44_API_KEY", "BASE44_APP_ID"];

// A step is given its own keys even when empty, as the workflow does; no other key reaches it.
test("the local run gives each step only its own keys, even ones the shell already exports", () => {
  const { dir, path } = stubbedCheckout("SHEET_ID=s\nSLACK_WEBHOOK_URL='https://hooks.example/x'\nBASE44_API_KEY='k'\nBASE44_APP_ID=a\n");
  const run = spawnSync("sh", ["scripts/local-run.sh"], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: path, BASE44_API_KEY: "exported" } });
  assert.equal(run.status, 0, run.stderr);
  const step = (name: string) => run.stdout.split("\n").filter((line) => line.startsWith(`[${name}`));
  assert.deepEqual(step("run --live"), ["[run --live] DETAILS_URL GOOGLE_SERVICE_ACCOUNT_JSON SHEET_ID SLACK_WEBHOOK_URL "]);
  assert.deepEqual(step("tsx scripts/publish-page.ts"), ["[tsx scripts/publish-page.ts] BASE44_API_KEY BASE44_APP_ID "]);
  assert.deepEqual(step("tsx scripts/append-run-log.ts"), ["[tsx scripts/append-run-log.ts] "]);
  assert.deepEqual(step("npm run"), ["[npm run] ", "[npm run] "]);
  assert.doesNotMatch(run.stdout + run.stderr, /hooks\.example|exported/);
});

test("the local run reads .env as data: nothing in it is run", () => {
  const marker = join(mkdtempSync(join(tmpdir(), "brightloop-marker-")), "ran");
  const { dir, path } = stubbedCheckout(`BASE44_API_KEY='$(touch ${marker})'\ntouch ${marker}\nexport X=1\n`);
  const run = spawnSync("sh", ["scripts/local-run.sh"], { cwd: dir, encoding: "utf8", env: { ...process.env, PATH: path } });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(existsSync(marker), false);
});
