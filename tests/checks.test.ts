import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { checkResult } from "../src/checks.ts";
import { OUTPUT_MARKER } from "../src/markers.ts";
import { briefExample, runCases } from "./helpers.ts";

// The output gate on its own, fed outputs a buggy judge could produce.

const input = briefExample();
const ids: string[] = input.signals.map((signal: { id: string }) => signal.id);
const banned: string[] = input.brand.banned_words;

function brokenOutput(change: (result: any) => void): unknown {
  const result: any = structuredClone(runCases(input));
  change(result);
  return result;
}

describe("the output check", () => {
  test("passes the brief example's result", () => {
    assert.deepEqual(checkResult(runCases(input), ids, banned), []);
  });

  const rejects: [string, (result: any) => void, RegExp][] = [
    ["a missing link", (r) => delete r.items[0].link, /item 1: no link/],
    ["a missing call to action", (r) => (r.items[0].cta = ""), /item 1: no call to action/],
    ["confidence above 1", (r) => (r.items[0].confidence = 1.5), /item 1: confidence is not between 0 and 1/],
    ["confidence below 0", (r) => (r.items[1].confidence = -0.1), /item 2: confidence is not between 0 and 1/],
    ["a banned brand word", (r) => (r.items[0].why = "A game-changing move."), /banned brand word/],
    ["the forbidden marker", (r) => r.run.errors.push(OUTPUT_MARKER), /forbidden marker/],
    ["the wrong built_for", (r) => (r.built_for = "daniel"), /built_for is not "maya"/],
    ["a missing run", (r) => delete r.run, /run is missing/],
    ["items that are not a list", (r) => (r.items = {}), /items is not a list/],
    ["an input id that disappears", (r) => r.skipped.pop(), /sg-304 is in neither an item nor skipped/],
    ["an input id that lands twice", (r) => r.skipped.push({ id: "pr-401", reason: "again" }), /pr-401 lands 2 times/],
    ["an id that is not in the input", (r) => r.skipped.push({ id: "made-up", reason: "x" }), /made-up is not in the input/],
  ];
  for (const [what, change, problem] of rejects) {
    test(`rejects ${what}`, () => {
      assert.match(checkResult(brokenOutput(change), ids, banned).join("\n"), problem);
    });
  }
});
