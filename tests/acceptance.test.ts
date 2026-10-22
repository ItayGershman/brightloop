import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { markerHits } from "../scripts/marker-scan.ts";
import { checkResult } from "../src/checks.ts";
import { pricing, RULES, type Rule } from "../src/judge.ts";
import { CODE_MARKERS, OUTPUT_MARKER } from "../src/markers.ts";
import type { Item } from "../src/types.ts";
import { briefExample, pricingSignal, runCases } from "./helpers.ts";

// One block per acceptance criterion of issue #2, in its order. Judging goes through the
// run(source) seam; the CLI and the repo check are tested as the commands graders run.

const input = briefExample();
const inputIds: string[] = input.signals.map((signal: { id: string }) => signal.id);

function runWithItem(change: (item: Item) => void, brand: Record<string, unknown> = {}) {
  const faulty: Rule = (signal) => {
    const judgement = pricing(signal);
    if (judgement?.kind === "item") change(judgement.item);
    return judgement;
  };
  return runCases({ brand, signals: [pricingSignal({})] }, [faulty, ...RULES]);
}

function cli(args: string[]) {
  // An empty environment: no keys, no config, only what is needed to find node and npm.
  return spawnSync("./run", args, { encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } });
}

describe("AC1: the CLI writes result.json in the required wrapper from the brief's example", () => {
  test("./run --input --output writes the wrapper", () => {
    const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
    const run = cli(["--input", "cases/brief-example/input.json", "--output", output]);
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(Object.keys(result), ["built_for", "items", "skipped", "run"]);
    assert.equal(result.built_for, "maya");
    assert.deepEqual(Object.keys(result.run), ["started_at", "cost_usd", "errors"]);
    assert.deepEqual(checkResult(result, inputIds, input.brand.banned_words), []);
  });

  test("a command without --output is a usage error", () => {
    const run = cli(["--input", "cases/brief-example/input.json"]);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /usage: run --input/);
  });
});

describe("AC2: every input id appears exactly once, in an item's source_ids or in skipped", () => {
  test("on the brief's example", () => {
    const result = runCases(input);
    const landed = [...result.items.flatMap((item) => item.source_ids), ...result.skipped.map((entry) => entry.id)];
    assert.deepEqual(landed.sort(), [...inputIds].sort());
  });
});

describe("AC3: ad and launch signals are skipped as outside Maya's job", () => {
  test("on the brief's example", () => {
    const result = runCases(input);
    for (const signal of input.signals.filter((s: { type: string }) => s.type === "ad" || s.type === "launch")) {
      const skipped = result.skipped.find((entry) => entry.id === signal.id);
      assert.ok(skipped, `${signal.id} is skipped`);
      assert.match(skipped.reason, new RegExp(`^${signal.type} signal, outside Maya's job`));
    }
    assert.deepEqual(result.items.map((item) => item.source_ids), [["pr-401"], ["pr-402"]]);
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
      const result = runWithItem(change);
      assert.deepEqual(result.items, []);
      assert.match(result.run.errors.join("\n"), problem);
      assert.deepEqual(result.skipped.map((entry) => entry.id), ["pr-1"]);
      assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
    });
  }

  test("an item with a banned brand word is held back, and the word is not repeated", () => {
    const result = runWithItem((item) => (item.why = "A seamless move."), { banned_words: ["seamless"] });
    assert.deepEqual(result.items, []);
    assert.match(result.run.errors.join("\n"), /banned brand word/);
    assert.ok(!JSON.stringify(result).toLowerCase().includes("seamless"));
  });

  test("a rule that loses or invents an id is reported", () => {
    const loses: Rule = (signal) => ({ kind: "skipped", skipped: { id: `${signal.id}-renamed`, reason: "x" } });
    const result = runCases({ signals: [pricingSignal({})] }, [loses]);
    assert.match(result.run.errors.join("\n"), /input id pr-1 is in neither an item nor skipped/);
    assert.match(result.run.errors.join("\n"), /id pr-1-renamed is not in the input/);
  });

  // run() always builds the wrapper itself, so a broken wrapper can only reach the gate
  // directly: this is the check every result passes before the CLI writes it.
  const brokenWrappers: [string, (result: any) => void, RegExp][] = [
    ["the wrong built_for", (r) => (r.built_for = "daniel"), /built_for is not "maya"/],
    ["no run", (r) => delete r.run, /run is missing/],
    ["items that are not a list", (r) => (r.items = {}), /items is not a list/],
    ["a started_at that is not a time", (r) => (r.run.started_at = "Monday"), /started_at is not an ISO 8601 time/],
  ];
  for (const [what, change, problem] of brokenWrappers) {
    test(`a wrapper with ${what} is rejected`, () => {
      const result: any = structuredClone(runCases(input));
      change(result);
      assert.match(checkResult(result, inputIds, []).join("\n"), problem);
    });
  }
});

describe("AC5: the repo check fails if a forbidden marker appears in the code", () => {
  for (const [index, marker] of CODE_MARKERS.entries()) {
    test(`marker #${index + 1} in a code file fails`, () => {
      assert.deepEqual(markerHits([{ path: "src/worker.ts", text: `console.log("${marker}")` }]), [
        `src/worker.ts: contains forbidden marker #${index + 1}`,
      ]);
    });
  }

  test("a marker in an expected output fails", () => {
    assert.equal(markerHits([{ path: "cases/x/expected.json", text: OUTPUT_MARKER }]).length, 1);
  });

  test("docs and verbatim case inputs, which quote the markers as data, are not scanned", () => {
    const text = CODE_MARKERS.join(" ");
    assert.deepEqual(markerHits([{ path: "SPOTTED.md", text }, { path: "cases/brief-example/input.json", text }]), []);
  });
});

describe("AC6: one proof command runs everything, and CI runs it on every push", () => {
  test("npm test runs the typecheck, the repo check and every test file", () => {
    const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts;
    assert.equal(scripts.test, "npm run typecheck && npm run repo-check && npm run suite");
    assert.equal(scripts.typecheck, "tsc --noEmit");
    assert.match(scripts.suite, /tests\/\*\.test\.ts/);
  });

  test("CI runs npm test on every push", () => {
    const workflow = readFileSync(".github/workflows/proof.yml", "utf8");
    assert.match(workflow, /^on:\n  push:/m);
    assert.match(workflow, /- run: npm ci\n      - run: npm test\n/);
  });
});

describe("AC7: a fresh clone with no keys runs the proof green", () => {
  // CI is that fresh clone with no secrets; this test pins the part a test can see:
  // the run reads nothing from the environment.
  test("the CLI gives the expected result with an empty environment", () => {
    const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.json");
    assert.equal(cli(["--input", "cases/brief-example/input.json", "--output", output]).status, 0);
    const result = JSON.parse(readFileSync(output, "utf8"));
    const expected = JSON.parse(readFileSync("cases/brief-example/expected.json", "utf8"));
    assert.deepEqual({ ...result, run: { ...result.run, started_at: "" } }, { ...expected, run: { ...expected.run, started_at: "" } });
  });
});
