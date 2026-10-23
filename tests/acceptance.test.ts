import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, test } from "node:test";
import { repoProblems } from "../scripts/marker-scan.ts";
import { checkResult } from "../src/checks/index.ts";
import { AUDIENCE } from "../src/config/audience.ts";
import type { Item } from "../src/domain/types.ts";
import { pricing, RULES } from "../src/judging/rules.ts";
import type { Rule } from "../src/judging/run-rules.ts";
import { CODE_MARKERS, OUTPUT_MARKER } from "../src/text/markers.ts";
import { briefExample, landedIds, pricingSignal, runCases } from "./helpers.ts";

// One block per acceptance criterion of issue #2, in its order. Judging goes through the
// run(input) seam; the CLI, the repo check and the proof are run as the commands graders run.

const input = briefExample();
const inputIds: string[] = input.signals.map((signal: { id: string }) => signal.id);
const NESTED = "BRIGHTLOOP_NESTED_PROOF";

/** A run whose pricing rule is buggy in one way, to prove the checks catch that bug. */
function runWithFaultyItem(change: (item: Item) => void, extra: Record<string, unknown> = {}) {
  const faulty: Rule = (pending) =>
    pricing(pending).map((judgement) => {
      if (judgement.kind === "item") change(judgement.item);
      return judgement;
    });
  return runCases({ signals: [pricingSignal({})], ...extra }, [faulty, ...RULES]);
}

function tempFile(name: string): string {
  return join(mkdtempSync(join(tmpdir(), "brightloop-")), name);
}

/** The CLI with an empty environment: no keys, no config, only what finds node and npm. */
function cli(args: string[]) {
  return spawnSync("./run", args, { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } });
}

describe("AC1: the CLI writes result.json in the required wrapper from the brief's example", () => {
  test("./run --input --output writes the wrapper", () => {
    const output = tempFile("result.json");
    const run = cli(["--input", "cases/brief-example/input.json", "--output", output]);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(readFileSync(output, "utf8"));
    // The brief's four keys, plus the documented Slack line (README, "Output fields").
    assert.deepEqual(Object.keys(result), ["built_for", "items", "skipped", "run", "slack"]);
    assert.equal(result.built_for, AUDIENCE.builtFor);
    assert.deepEqual(Object.keys(result.run), ["started_at", "cost_usd", "errors"]);
    assert.deepEqual(checkResult(result, { inputIds, bannedWords: input.brand.banned_words, secrets: [input.config.demo_key] }), []);
  });
});

describe("AC2: every input id appears exactly once, in an item's source_ids or in skipped", () => {
  test("on the brief's example", () => {
    assert.deepEqual(landedIds(runCases(input)), [...inputIds].sort());
  });

  test("a rule that invents an id is reported, and the real signal still lands once", () => {
    const invents: Rule = (pending) => pending.map((signal) => ({ kind: "skipped", skipped: { id: `${signal.id}-x`, reason: "x" } }));
    const result = runCases({ signals: [pricingSignal({})] }, [invents]);
    assert.deepEqual(result.skipped.filter((entry) => entry.id === "pr-1").length, 1);
    assert.match(result.run.errors.join("\n"), /1 id\(s\) in the output are not in the input/);
  });

  test("a rule that decides one signal twice is reported", () => {
    const twice: Rule = (pending) => pending.flatMap((signal) => [1, 2].map(() => ({ kind: "skipped" as const, skipped: { id: signal.id, reason: "x" } })));
    assert.match(runCases({ signals: [pricingSignal({})] }, [twice]).run.errors.join("\n"), /input signal 1 lands 2 times instead of once/);
  });
});

describe("AC3: ad and launch signals are skipped as outside the watch's scope", () => {
  test("on the brief's example", () => {
    const result = runCases(input);
    for (const signal of input.signals.filter((s: { type: string }) => s.type === "ad" || s.type === "launch")) {
      const skipped = result.skipped.find((entry) => entry.id === signal.id);
      assert.ok(skipped, `${signal.id} is skipped`);
      assert.ok(skipped.reason.startsWith(`${signal.type} signal, outside the watch's scope: ${AUDIENCE.scope}`), skipped.reason);
    }
    // Pricing signals are never skipped as out of scope; pr-402 is skipped by source trust (#3) instead.
    assert.deepEqual(result.items.map((item) => item.source_ids), [["pr-401"]]);
    assert.ok(!result.skipped.find((entry) => entry.id === "pr-402")?.reason.includes("outside the watch's scope"));
  });
});

describe("AC4: the in-run checks reject a bad output and record it in run.errors", () => {
  const rejects: [string, (item: Item) => void, RegExp][] = [
    ["a missing link", (item) => (item.link = ""), /no link/],
    ["a missing call to action", (item) => (item.cta = ""), /no call to action/],
    ["confidence above 1", (item) => (item.confidence = 1.5), /confidence is not between 0 and 1/],
    ["confidence below 0", (item) => (item.confidence = -0.1), /confidence is not between 0 and 1/],
    ["the forbidden marker", (item) => (item.why = `Fine. ${OUTPUT_MARKER}`), /forbidden marker/],
  ];
  for (const [what, change, problem] of rejects) {
    test(`an item with ${what} is held back`, () => {
      const result = runWithFaultyItem(change);
      assert.deepEqual(result.items, []);
      assert.match(result.run.errors.join("\n"), problem);
      assert.deepEqual(result.skipped.map((entry) => entry.id), ["pr-1"]);
      assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
    });
  }

  test("an item with a banned brand word is held back, and the word is not repeated", () => {
    const result = runWithFaultyItem((item) => (item.why = "A seamless move."), { brand: { banned_words: ["seamless"] } });
    assert.deepEqual(result.items, []);
    assert.match(result.run.errors.join("\n"), /banned brand word/);
    assert.ok(!JSON.stringify(result).toLowerCase().includes("seamless"));
  });

  // run() always builds the wrapper itself, so a broken wrapper can only reach the gate
  // directly: this is the check every result passes before the CLI writes it.
  const brokenWrappers: [string, (result: any) => void, RegExp][] = [
    ["the wrong built_for", (r) => (r.built_for = "someone-else"), /wrapper: built_for is not/],
    ["no run", (r) => delete r.run, /run is missing/],
    ["items that are not a list", (r) => (r.items = {}), /items is not a list/],
    ["a started_at that is not a time", (r) => (r.run.started_at = "Monday"), /started_at is not an ISO 8601 time/],
  ];
  for (const [what, change, problem] of brokenWrappers) {
    test(`a wrapper with ${what} is rejected`, () => {
      const result: any = structuredClone(runCases(input));
      change(result);
      assert.match(checkResult(result, { inputIds, bannedWords: [], secrets: [] }).join("\n"), problem);
    });
  }
});

describe("AC5: the repo check fails if a forbidden marker appears in the code", () => {
  for (const [index, marker] of CODE_MARKERS.entries()) {
    test(`marker #${index + 1} in a code file fails`, () => {
      assert.deepEqual(repoProblems([{ path: "src/worker.ts", text: `console.log("${marker}")` }]), [
        `src/worker.ts: contains forbidden marker #${index + 1}`,
      ]);
    });
  }

  test("a marker in other Markdown, another case input or an output fails", () => {
    for (const path of ["README.md", "interviews/notes.md", "cases/other/input.json", "cases/x/expected.json", "result.json"]) {
      assert.equal(repoProblems([{ path, text: OUTPUT_MARKER }]).length, 1, path);
    }
  });

  test("only the trap docs and the brief's verbatim example may name the markers", () => {
    const text = CODE_MARKERS.join(" ");
    const allowed = ["SPEC.md", "DECISIONS.md", "SPOTTED.md", "docs/adr/0001-outside-text-is-data.md", "cases/brief-example/input.json"];
    assert.deepEqual(repoProblems(allowed.map((path) => ({ path, text }))), []);
  });

  test("a dependency resolved outside the public registry fails", () => {
    const text = '{ "resolved": "https://registry.npmjs.org/a/-/a-1.tgz", "resolved": "https://mirror.example/b/-/b-1.tgz" }';
    assert.deepEqual(repoProblems([{ path: "package-lock.json", text }]), [
      "package-lock.json: 1 dependencies resolve outside https://registry.npmjs.org/",
    ]);
  });
});

describe("AC6: one proof command, npm test, runs the typecheck, the repo check and every test", { skip: process.env[NESTED] === "1" }, () => {
  /** A copy of this repo, in its own git repository, sharing node_modules. */
  function repoCopy(): string {
    const root = mkdtempSync(join(tmpdir(), "brightloop-proof-"));
    const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" });
    for (const file of files.split("\n").filter(Boolean)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      cpSync(file, join(root, file));
    }
    symlinkSync(resolve("node_modules"), join(root, "node_modules"));
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    return root;
  }

  function proofIn(root: string) {
    // NODE_TEST_CONTEXT is set by the test runner running this file; inherited, it makes the
    // nested runner report to us as a child and exit 0 whatever happens (Node 20 and later).
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env;
    return spawnSync("npm", ["test"], { cwd: root, encoding: "utf8", env: { ...env, [NESTED]: "1" } });
  }

  const plants: [string, string, string][] = [
    ["a type error", "src/planted.ts", 'export const planted: number = "not a number";\n'],
    ["a forbidden marker in the code", "src/planted.ts", `export const planted = "${OUTPUT_MARKER}";\n`],
    ["a failing test", "tests/planted.test.ts", 'import { test } from "node:test";\ntest("planted", () => { throw new Error("planted"); });\n'],
  ];
  for (const [what, path, text] of plants) {
    test(`fails on ${what}`, () => {
      const root = repoCopy();
      writeFileSync(join(root, path), text);
      const proof = proofIn(root);
      assert.notEqual(proof.status, 0, `${what} should fail the proof`);
    });
  }

  test("passes on a clean copy of this repo", () => {
    const proof = proofIn(repoCopy());
    assert.equal(proof.status, 0, proof.stdout + proof.stderr);
  });
});

describe("AC7: a fresh clone with no keys runs the proof green", () => {
  // Proving this needs a clean machine: the CI job is that fresh clone, on a runner with no
  // secrets, and its result shows on the pull request. This test pins the part a test can
  // see: the CLI reads nothing from the environment.
  test("the CLI gives the expected result with an empty environment", () => {
    const output = tempFile("result.json");
    assert.equal(cli(["--input", "cases/brief-example/input.json", "--output", output]).status, 0);
    const result = JSON.parse(readFileSync(output, "utf8"));
    const expected = JSON.parse(readFileSync("cases/brief-example/expected.json", "utf8"));
    const { slack, ...wrapper } = result;
    assert.deepEqual({ ...wrapper, run: { ...wrapper.run, started_at: "" } }, { ...expected, run: { ...expected.run, started_at: "" } });
    // The Slack line is still written, and a cases-file run never posts.
    assert.equal(slack.status, "not posted: only a live run posts");
  });
});
