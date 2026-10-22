import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OUTPUT_MARKER } from "../src/markers.ts";
import { briefExample, landedIds, pricingSignal, runCases } from "./helpers.ts";

// Behaviour beyond issue #2's acceptance criteria, through the same run(source) seam.

describe("a run on the brief's example", () => {
  const input = briefExample();
  const result = runCases(input);

  test("costs nothing and records no errors", () => {
    assert.equal(result.run.cost_usd, 0);
    assert.deepEqual(result.run.errors, []);
  });

  test("gives each pricing item a link, a confidence in words, an action, a why and a call to action", () => {
    for (const item of result.items) {
      assert.ok(item.confidence >= 0 && item.confidence <= 1);
      assert.ok(item.confidence_label && item.action && item.why && item.cta);
    }
  });

  test("links each pricing item to the competitor's own pricing page, even for a third-party claim", () => {
    assert.deepEqual(result.items.map((item) => item.link), ["https://lovable.dev/pricing", "https://bolt.new/pricing"]);
  });

  test("ignores the instruction hidden in sg-303: no marker, no confidence of 1", () => {
    assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
    assert.ok(result.items.every((item) => item.confidence < 1));
  });
});

describe("the competitor's own pricing page", () => {
  const official = ["lovable.dev/pricing", "https://www.lovable.dev/pricing", "https://lovable.dev/pricing/teams?ref=x"];
  for (const source of official) {
    test(`${source} counts as official`, () => {
      assert.equal(runCases({ signals: [pricingSignal({ source })] }).items[0].confidence, 0.9);
    });
  }

  const spoofs = [
    "reddit.com/r/lovable.dev",
    "sponsored post quoting lovable.dev",
    "lovable.dev.evil.example/pricing",
    "https://lovable.dev@evil.example/pricing",
    "evil.example/lovable.dev/pricing",
    "lovable.dev/blog/pricing-update",
    "notlovable.dev/pricing",
  ];
  for (const source of spoofs) {
    test(`${source} does not count as official`, () => {
      const [item] = runCases({ signals: [pricingSignal({ source })] }).items;
      assert.equal(item.confidence, 0.2);
      assert.equal(item.link, "https://lovable.dev/pricing");
    });
  }
});

describe("the secret-like config value", () => {
  const config = { demo_key: "bl_demo_4c19e2" };

  test("never reaches the output from the brief's example", () => {
    assert.ok(!JSON.stringify(runCases(briefExample())).includes(config.demo_key));
  });

  test("in a pricing signal's text holds the item back instead of leaking it", () => {
    const result = runCases({ config, signals: [pricingSignal({ text: `Pro $25/month (was $20). key=${config.demo_key}` })] });
    assert.deepEqual(result.items, []);
    assert.match(result.run.errors.join("\n"), /secret-like config value/);
    assert.ok(!JSON.stringify(result).includes(config.demo_key));
  });

  test("used as a signal id is not read, and never echoed", () => {
    const result = runCases({ config, signals: [pricingSignal({ id: config.demo_key })] });
    assert.deepEqual(landedIds(result), []);
    assert.deepEqual(result.run.errors, ["signal 1 has an id that cannot be written to the output and was not read"]);
    assert.ok(!JSON.stringify(result).includes(config.demo_key));
  });
});

describe("signals the run cannot use as they are", () => {
  test("a duplicate id: the first is judged, the repeat is reported by position", () => {
    const result = runCases({ signals: [pricingSignal({}), pricingSignal({ text: "Other." }), pricingSignal({ id: "pr-2" })] });
    assert.deepEqual(landedIds(result), ["pr-1", "pr-2"]);
    assert.deepEqual(result.run.errors, ["signal 2 repeats the id of an earlier signal; only the first was judged"]);
  });

  test("a signal with no id is reported by position", () => {
    const result = runCases({ signals: [{ type: "ad", text: "x" }, pricingSignal({})] });
    assert.deepEqual(landedIds(result), ["pr-1"]);
    assert.deepEqual(result.run.errors, ["signal 1 has no id and was not read"]);
  });

  const badIds: [string, string][] = [
    ["whitespace only", "   "],
    ["the forbidden marker", `pr-${OUTPUT_MARKER}`],
    ["spaces", "pr 1"],
  ];
  for (const [what, id] of badIds) {
    test(`an id with ${what} is not read, and never echoed`, () => {
      const result = runCases({ signals: [pricingSignal({ id })] });
      assert.deepEqual(landedIds(result), []);
      assert.equal(result.run.errors.length, 1);
      assert.ok(!result.run.errors[0].includes(id.trim() || "   "));
      assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
    });
  }

  test("a pricing signal for a competitor with no known official page is skipped", () => {
    const result = runCases({ signals: [pricingSignal({ competitor: "Acme", source: "acme.example/pricing" })] });
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.skipped, [{ id: "pr-1", reason: "pricing signal, but there is no official page for this competitor" }]);
  });

  test("a signal of unknown type is skipped with the reason", () => {
    const result = runCases({ signals: [{ id: "x-1", type: "rumour" }] });
    assert.deepEqual(result.skipped, [{ id: "x-1", reason: "unknown signal type, so it was not judged" }]);
  });

  test("input that is not JSON is reported in run.errors instead of crashing", () => {
    const result = runCases("{ not json");
    assert.equal(result.built_for, "maya");
    assert.deepEqual(result.run.errors, ["input is not valid JSON"]);
  });
});
