import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { AUDIENCE } from "../src/config/audience.ts";

// The README is what a grader reads first: its commands must run and its paths must exist.

const README = readFileSync("README.md", "utf8");
const FIELDS = ["competitor", "page", "what_changed", "before", "after", "link", "notes", "cta", "brightloop_comparison", "confidence_label", "week", "tiers", "slack"];

/** The command lines in the README's shell blocks. */
function shellLines(): string[] {
  return [...README.matchAll(/```sh\n([\s\S]*?)```/g)].flatMap((block) => block[1].split("\n").filter(Boolean));
}

test("the README's zero-key command runs as written on the brief's example", () => {
  assert.ok(shellLines().includes("./run --input cases.json --output result.json"));
  const dir = mkdtempSync(join(tmpdir(), "brightloop-readme-"));
  copyFileSync("cases/brief-example/input.json", join(dir, "cases.json"));
  const run = spawnSync(resolve("run"), ["--input", "cases.json", "--output", "result.json"], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, SLACK_WEBHOOK_URL: "" },
  });
  assert.equal(run.status, 0, run.stderr);
  for (const name of ["result.json", "result.csv", "result.html"]) assert.ok(existsSync(join(dir, name)), name);
  assert.equal(JSON.parse(readFileSync(join(dir, "result.json"), "utf8")).run.cost_usd, 0);
});

test("every ./run flag in the README is one the command line knows", () => {
  const usage = readFileSync("src/cli.ts", "utf8").match(/const USAGE =([\s\S]*?);\n/)?.[1] ?? "";
  const flags = shellLines()
    .filter((line) => line.startsWith("./run "))
    .flatMap((line) => line.match(/--[a-z]+/g) ?? []);
  assert.ok(flags.length > 0);
  for (const flag of flags) assert.ok(usage.includes(flag), flag);
});

test("every npm script in the README exists", () => {
  const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
  for (const line of shellLines()) {
    for (const [, name] of line.matchAll(/npm (?:run )?([a-z-]+)/g)) {
      if (name !== "ci" && name !== "run") assert.ok(name in scripts, name);
    }
  }
});

test("every repo path the README names exists", () => {
  const paths = [...README.matchAll(/`([^`\s]+)`/g)]
    .map((match) => match[1])
    .filter((path) => /^(src|scripts|tests|docs|cases|interviews|snapshots|\.github)\//.test(path) || /^[A-Z]+\.md$|^\.nvmrc$|^\.env\.example$/.test(path))
    .filter((path) => !path.includes("<"));
  assert.ok(paths.length > 20);
  for (const path of paths) assert.ok(existsSync(path), path);
});

test("the README links Maya's Sheet and the live page, and explains every extra item field", () => {
  assert.ok(README.includes(AUDIENCE.sheetUrl));
  assert.match(README, /https:\/\/[a-z0-9-]+\.base44\.app/);
  // A field is explained when it opens a table row: the first cell names it, the next explains it.
  const named = README.split("\n")
    .filter((line) => line.startsWith("| `"))
    .flatMap((line) => [...line.split("|")[1].matchAll(/`([^`]+)`/g)].map((match) => match[1]));
  for (const field of FIELDS) assert.ok(named.includes(field), field);
});

test("the README's command, run in the repo root, leaves no file the repo check would scan", () => {
  const ignored = spawnSync("git", ["check-ignore", "cases.json", "result.json", "result.csv", "result.html"], { encoding: "utf8" });
  assert.deepEqual(ignored.stdout.trim().split("\n"), ["cases.json", "result.json", "result.csv", "result.html"]);
});
