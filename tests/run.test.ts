import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AUDIENCE } from "../src/config/audience.ts";
import { COMPETITORS } from "../src/config/competitors.ts";
import { OUTPUT_MARKER } from "../src/text/markers.ts";
import { briefExample, landedIds, pricingSignal, runCases } from "./helpers.ts";

// Behaviour beyond issue #2's acceptance criteria, through the same run(input) seam.

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

// Every registered competitor, so a new registry entry is covered with no new test code.
for (const competitor of COMPETITORS) {
  describe(`the registered competitor ${competitor.name}`, () => {
    const pricingUrl = new URL(competitor.pricingPage);
    const page = `${pricingUrl.host}${pricingUrl.pathname}`;

    test("has its pricing page and homepage on its own domain", () => {
      assert.equal(pricingUrl.hostname, competitor.domain);
      assert.equal(new URL(competitor.homepage).hostname, competitor.domain);
    });

    for (const name of [competitor.name, competitor.name.toUpperCase(), ...competitor.aliases]) {
      test(`is found under the name "${name}" and linked to its own pricing page`, () => {
        const [item] = runCases({ signals: [pricingSignal({ competitor: name, source: competitor.pricingPage })] }).items;
        assert.equal(item.competitor, competitor.name);
        assert.equal(item.link, competitor.pricingPage);
      });
    }

    const official = [competitor.pricingPage, page, `https://www.${page}`, `${page}/teams?ref=x`];
    for (const source of official) {
      test(`${source} counts as its official pricing page`, () => {
        const [item] = runCases({ signals: [pricingSignal({ competitor: competitor.name, source })] }).items;
        assert.equal(item.confidence, 0.9);
        assert.match(item.confidence_label, /^confirmed/);
      });
    }

    const spoofs = [
      competitor.homepage,
      `reddit.com/r/${competitor.domain}`,
      `sponsored post quoting ${competitor.domain}`,
      `${competitor.domain}.evil.example/pricing`,
      `https://${competitor.domain}@evil.example/pricing`,
      `evil.example/${page}`,
      `not${page}`,
    ];
    for (const source of spoofs) {
      test(`${source} does not count as its official pricing page`, () => {
        const [item] = runCases({ signals: [pricingSignal({ competitor: competitor.name, source })] }).items;
        assert.equal(item.confidence, 0.2);
        assert.match(item.confidence_label, /^unconfirmed/);
        assert.equal(item.link, competitor.pricingPage);
      });
    }
  });
}

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
    assert.equal(result.built_for, AUDIENCE.builtFor);
    assert.deepEqual(result.run.errors, ["input is not valid JSON"]);
  });
});
