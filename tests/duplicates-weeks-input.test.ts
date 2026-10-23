import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { checkResult } from "../src/checks/index.ts";
import type { Result } from "../src/domain/types.ts";
import { briefExample, landedIds, pricingSignal, runCases } from "./helpers.ts";

// One block per acceptance criterion of issue #5, in its order, through the run(input) seam.

const JERUSALEM = { week: "2026-W43", timezone: "Asia/Jerusalem" };

/** Whether a result passes the wrapper and id checks, for the given input text. */
function validWrapper(result: Result, inputIds: string[]): string[] {
  return checkResult(result, { inputIds, bannedWords: [], secrets: [] });
}

function weekOf(ts: string, extra: Record<string, unknown> = {}): string | null | undefined {
  const [item] = runCases({ ...JERUSALEM, ...extra, signals: [pricingSignal({ ts })] }).items;
  return item.week;
}

describe("AC1: the sg-301 / sg-302 pair is one event, and each id lands exactly once", () => {
  const input = briefExample();
  const result = runCases(input);

  test("both are skipped together as launches, each naming the other", () => {
    const pair = result.skipped.filter((entry) => entry.id === "sg-301" || entry.id === "sg-302");
    assert.deepEqual(pair.map((entry) => entry.id).sort(), ["sg-301", "sg-302"]);
    assert.match(pair.find((entry) => entry.id === "sg-301")!.reason, /^launch signal, outside .*; same event at the same moment as sg-302$/);
    assert.match(pair.find((entry) => entry.id === "sg-302")!.reason, /^launch signal, outside .*; same event at the same moment as sg-301$/);
  });

  test("every id of the brief's example still lands exactly once", () => {
    assert.deepEqual(landedIds(result), input.signals.map((signal: { id: string }) => signal.id).sort());
    assert.deepEqual(result.run.errors, []);
  });

  test("two pricing signals on one change at the same UTC moment become one item with both ids", () => {
    const signals = [
      pricingSignal({ id: "pr-1", source: "press.example", ts: "2026-10-23 08:00 UTC" }),
      pricingSignal({ id: "pr-2", source: "lovable.dev/pricing", ts: "2026-10-23T11:00:00+03:00" }),
    ];
    const result = runCases({ ...JERUSALEM, signals });
    assert.equal(result.items.length, 1);
    assert.deepEqual(result.items[0].source_ids, ["pr-1", "pr-2"]);
    assert.equal(result.items[0].confidence, 0.9, "the merged item keeps the most trusted source");
    assert.match(result.items[0].notes, /Also reported by 1 other signal at the same moment\.$/);
  });

  test("a ts with no zone is read in the input's time zone before comparing", () => {
    const signals = [
      pricingSignal({ id: "pr-1", source: "press.example", ts: "2026-10-24 23:30" }),
      pricingSignal({ id: "pr-2", source: "lovable.dev/pricing", ts: "2026-10-24T20:30:00Z" }),
    ];
    assert.deepEqual(runCases({ ...JERUSALEM, signals }).items.map((item) => item.source_ids), [["pr-1", "pr-2"]]);
  });

  test("the hour repeated when clocks go back is read as its first occurrence", () => {
    const signals = [
      pricingSignal({ id: "pr-1", source: "press.example", ts: "2026-10-25 01:30" }),
      pricingSignal({ id: "pr-2", source: "lovable.dev/pricing", ts: "2026-10-24T22:30:00Z" }),
    ];
    assert.deepEqual(runCases({ ...JERUSALEM, signals }).items.map((item) => item.source_ids), [["pr-1", "pr-2"]]);
  });

  const notDuplicates: [string, Record<string, unknown>][] = [
    ["a minute apart", { ts: "2026-10-23T08:01:00Z" }],
    ["about another competitor", { competitor: "Bolt", source: "bolt.new/pricing" }],
    ["from the same source (two tiers changed at once)", { source: "press.example", text: "Teams $55/month (was $50)." }],
    ["stating a different new price", { text: "Pro plan shown at $30/month (was $20 last week)." }],
  ];
  for (const [what, change] of notDuplicates) {
    test(`a second signal ${what} stays its own item`, () => {
      const signals = [pricingSignal({ id: "pr-1", source: "press.example" }), pricingSignal({ id: "pr-2", ...change })];
      assert.deepEqual(runCases({ ...JERUSALEM, signals }).items.map((item) => item.source_ids), [["pr-1"], ["pr-2"]]);
    });
  }
});

describe("AC2: a signal near the 25 to 26 October week boundary lands in the right week in Asia/Jerusalem", () => {
  // Week 43 runs Monday 19 to Sunday 25 October. Clocks went back from UTC+3 to UTC+2 at 02:00
  // on 25 October, so Monday 26 October starts at 22:00 UTC on the 25th.
  test("23:30 local on Sunday is still week 43 (a fixed UTC+3 offset would say week 44)", () => {
    assert.equal(weekOf("2026-10-25T21:30:00Z"), "2026-W43");
  });

  test("00:30 local on Monday is week 44 (counting in UTC would say week 43)", () => {
    assert.equal(weekOf("2026-10-25T22:30:00Z"), "2026-W44");
  });

  test("the last and first minute of the boundary, given as local times", () => {
    assert.equal(weekOf("2026-10-25 23:59"), "2026-W43");
    assert.equal(weekOf("2026-10-26 00:00"), "2026-W44");
  });

  test("the same moment is week 43 for an input in UTC", () => {
    assert.equal(weekOf("2026-10-25T22:30:00Z", { timezone: "UTC" }), "2026-W43");
  });

  test("an item with no time has no week", () => {
    const [item] = runCases({ ...JERUSALEM, signals: [pricingSignal({ ts: undefined })] }).items;
    assert.equal(item.week, null);
  });
});

describe("AC3: empty input yields a valid wrapper with no items and no crash", () => {
  const empties: [string, string, string[]][] = [
    ["an empty file", "", ["input is empty"]],
    ["a file of whitespace", " \n\t", ["input is empty"]],
    ["an empty signals list", JSON.stringify({ ...JERUSALEM, signals: [] }), []],
  ];
  for (const [what, text, errors] of empties) {
    test(`${what}`, () => {
      const result = runCases(text);
      assert.deepEqual(validWrapper(result, []), []);
      assert.deepEqual(result.items, []);
      assert.deepEqual(result.skipped, []);
      assert.deepEqual(result.run.errors, errors);
    });
  }

  test("the CLI writes the wrapper for an empty file and exits 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "brightloop-"));
    writeFileSync(join(dir, "cases.json"), "");
    const run = spawnSync("./run", ["--input", join(dir, "cases.json"), "--output", join(dir, "result.json")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    assert.deepEqual(validWrapper(result, []), []);
    assert.deepEqual(result.run.errors, ["input is empty"]);
  });
});

describe("AC4: malformed input yields a valid wrapper with the problem in run.errors", () => {
  const malformed: [string, unknown, string][] = [
    ["JSON cut off halfway", '{ "signals": [ { "id": "pr-1"', "input is not valid JSON"],
    ["a list instead of an object", [pricingSignal({})], "input must be a JSON object"],
    ["signals that are not a list", { signals: "pr-1" }, "input has no signals list"],
    ["a signal that is not an object", { signals: ["Lovable Pro is $25"] }, "signal 1 has no id and was not read"],
    ["a time zone Intl does not know", { timezone: "Mars/Olympus_Mons", signals: [] }, "input timezone is not a known time zone; weeks are counted in UTC"],
    ["banned words that are not a list", { brand: { banned_words: "seamless" }, signals: [] }, "input brand.banned_words is not a list; no brand words were checked"],
  ];
  for (const [what, input, error] of malformed) {
    test(`${what}`, () => {
      const result = runCases(input);
      assert.deepEqual(validWrapper(result, []), []);
      assert.deepEqual(result.run.errors, [error]);
    });
  }

  const badTimes = ["last Friday", "2026-02-30 10:00", "2026-10-25T25:00:00Z", "2026-10-25T10:00:00+99:00", 1761300000];
  for (const ts of badTimes) {
    test(`a ts of ${JSON.stringify(ts)} is reported by position, and the signal is still judged`, () => {
      const result = runCases({ ...JERUSALEM, signals: [pricingSignal({ ts })] });
      assert.deepEqual(validWrapper(result, ["pr-1"]), []);
      assert.deepEqual(result.run.errors, ["signal 1 has a time (ts) that cannot be read; it was judged without one"]);
      assert.deepEqual(result.items.map((item) => [item.source_ids, item.week]), [[["pr-1"], null]]);
      assert.ok(!JSON.stringify(result.run.errors).includes(String(ts)));
    });
  }

  test("an unreadable ts is never merged as a duplicate", () => {
    const signals = [pricingSignal({ id: "pr-1", source: "press.example", ts: "soon" }), pricingSignal({ id: "pr-2", ts: "soon" })];
    assert.deepEqual(runCases({ ...JERUSALEM, signals }).items.map((item) => item.source_ids), [["pr-1"], ["pr-2"]]);
  });
});

describe("AC5: each rule has its own case in the case suite", () => {
  // The case suite (cases.test.ts) runs every directory; these pin what each one shows.
  const expected = (name: string): Result => JSON.parse(readFileSync(`cases/${name}/expected.json`, "utf8"));
  const cases: [string, (result: Result) => boolean][] = [
    ["duplicates", (r) => r.items.some((item) => item.source_ids.length > 1) && r.skipped.some((s) => s.reason.includes("same event"))],
    ["week-boundary", (r) => r.items.some((item) => item.week === "2026-W43") && r.items.some((item) => item.week === "2026-W44")],
    ["empty-input", (r) => r.items.length === 0 && r.run.errors.length === 0],
    ["empty-file", (r) => r.items.length === 0 && r.run.errors.includes("input is empty")],
    ["malformed-input", (r) => r.run.errors.length > 0],
    ["malformed-json", (r) => r.items.length === 0 && r.run.errors.includes("input is not valid JSON")],
  ];
  for (const [name, shows] of cases) {
    test(`cases/${name} exists and shows its rule`, () => {
      assert.ok(existsSync(`cases/${name}/input.json`));
      assert.ok(shows(expected(name)));
    });
  }
});
