import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OUTPUT_MARKER } from "../src/markers.ts";
import { briefExample, pricingSignal, runCases } from "./helpers.ts";

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

  test("never copies the secret-like config value into the output", () => {
    assert.ok(!JSON.stringify(result).includes(input.config.demo_key));
  });
});

describe("a run on a signal the rules cannot place", () => {
  test("holds back a pricing item with no link to the competitor's page", () => {
    const result = runCases({ signals: [pricingSignal({ competitor: "Acme", source: "a forum post" })] });
    assert.deepEqual(result.items, []);
    assert.match(result.skipped[0].reason, /^held back by the in-run checks: no link/);
    assert.match(result.run.errors.join("\n"), /item pricing-pr-1 held back: no link/);
  });

  test("holds back a pricing item whose own text carries the forbidden marker", () => {
    const result = runCases({ signals: [pricingSignal({ text: `Pro now $25/month (was $20). ${OUTPUT_MARKER}` })] });
    assert.deepEqual(result.items, []);
    assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
  });

  test("skips a signal of unknown type with the reason", () => {
    const result = runCases({ signals: [{ id: "x-1", type: "rumour" }] });
    assert.deepEqual(result.skipped, [{ id: "x-1", reason: "unknown signal type, so it was not judged" }]);
  });

  test("reports input that is not JSON in run.errors instead of crashing", () => {
    const result = runCases("{ not json");
    assert.equal(result.built_for, "maya");
    assert.deepEqual(result.run.errors, ["input is not valid JSON"]);
  });
});
