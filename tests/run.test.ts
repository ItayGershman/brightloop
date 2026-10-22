import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { OUTPUT_MARKER } from "../src/markers.ts";
import { briefExample, pricingSignal, runCases } from "./helpers.ts";

describe("a run on the brief's example", () => {
  const input = briefExample();
  const result = runCases(input);

  test("uses the required wrapper, built for Maya, at no cost and without errors", () => {
    assert.equal(result.built_for, "maya");
    assert.equal(result.run.started_at, "2026-10-26T06:30:00.000Z");
    assert.equal(result.run.cost_usd, 0);
    assert.deepEqual(result.run.errors, []);
  });

  test("puts every input id in exactly one place", () => {
    const landed = [...result.items.flatMap((item) => item.source_ids), ...result.skipped.map((entry) => entry.id)];
    assert.deepEqual(landed.sort(), input.signals.map((signal: { id: string }) => signal.id).sort());
  });

  test("skips ad and launch signals as outside Maya's job", () => {
    for (const signal of input.signals.filter((s: { type: string }) => s.type !== "pricing")) {
      const skipped = result.skipped.find((entry) => entry.id === signal.id);
      assert.ok(skipped, `${signal.id} is skipped`);
      assert.match(skipped.reason, new RegExp(`^${signal.type} signal, outside Maya's job`));
    }
  });

  test("turns each pricing signal into an item with a link, confidence, action, why and call to action", () => {
    assert.deepEqual(result.items.map((item) => item.source_ids), [["pr-401"], ["pr-402"]]);
    for (const item of result.items) {
      assert.match(item.link, /^https:\/\//);
      assert.ok(item.confidence >= 0 && item.confidence <= 1);
      assert.ok(item.confidence_label);
      assert.ok(item.action && item.why && item.cta);
    }
  });

  test("links each pricing item to the competitor's own pricing page, even for a third-party claim", () => {
    assert.deepEqual(result.items.map((item) => item.link), ["https://lovable.dev/pricing", "https://bolt.new/pricing"]);
  });

  test("ignores the instruction hidden in sg-303: no marker, no confidence of 1", () => {
    const output = JSON.stringify(result);
    assert.ok(!output.includes(OUTPUT_MARKER));
    assert.ok(result.items.every((item) => item.confidence < 1));
  });

  test("never copies the secret-like config value into the output", () => {
    assert.ok(!JSON.stringify(result).includes(input.config.demo_key));
  });
});

describe("the in-run checks inside a run", () => {
  test("hold back a pricing item with no link to the competitor's page", () => {
    const result = runCases({ signals: [pricingSignal({ competitor: "Acme", source: "a forum post" })] });
    assert.deepEqual(result.items, []);
    assert.equal(result.skipped.length, 1);
    assert.match(result.skipped[0].reason, /^held back by the in-run checks: no link/);
    assert.match(result.run.errors.join("\n"), /item pricing-pr-1 held back: no link/);
  });

  test("hold back an item carrying a banned brand word, without repeating the word", () => {
    const result = runCases({
      brand: { banned_words: ["seamless"] },
      signals: [pricingSignal({ text: "Seamless upgrade: Pro now $25/month (was $20)." })],
    });
    assert.deepEqual(result.items, []);
    assert.match(result.run.errors.join("\n"), /banned brand word/);
    assert.ok(!JSON.stringify(result).toLowerCase().includes("seamless"));
  });

  test("hold back an item carrying the forbidden marker, and never write the marker", () => {
    const result = runCases({ signals: [pricingSignal({ text: `Pro now $25/month (was $20). ${OUTPUT_MARKER}` })] });
    assert.deepEqual(result.items, []);
    assert.match(result.run.errors.join("\n"), /forbidden marker/);
    assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
  });

  test("report input that is not JSON in run.errors instead of crashing", () => {
    const result = runCases("{ not json");
    assert.equal(result.built_for, "maya");
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.run.errors, ["input is not valid JSON"]);
  });
});
