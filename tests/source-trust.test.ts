import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { COMPETITORS } from "../src/config/competitors.ts";
import type { Result } from "../src/domain/types.ts";
import { OUTPUT_MARKER } from "../src/text/markers.ts";
import { briefExample, pricingSignal, runCases } from "./helpers.ts";

// One block per acceptance criterion of issue #3, in its order, through the run(input) seam;
// "never in the logs" runs the CLI as graders do.

const input = briefExample();
const signal = (id: string) => structuredClone(input.signals.find((s: { id: string }) => s.id === id));
const DEMO_KEY: string = input.config.demo_key;

/** A cases file as the tests change it: its signals list, the rest as it is. */
interface Cases {
  signals: Record<string, unknown>[];
  [field: string]: unknown;
}

function caseInput(name: string): Cases {
  return JSON.parse(readFileSync(`cases/${name}/input.json`, "utf8"));
}

function itemFor(result: Result, id: string) {
  return result.items.find((item) => item.source_ids.includes(id));
}

/** The CLI on a cases object, with an empty environment: its output file and everything it printed. */
function cli(cases: unknown): { written: string; printed: string } {
  const dir = mkdtempSync(join(tmpdir(), "brightloop-trust-"));
  writeFileSync(join(dir, "input.json"), JSON.stringify(cases));
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
  const run = spawnSync("./run", ["--input", join(dir, "input.json"), "--output", join(dir, "result.json")], { encoding: "utf8", env });
  assert.equal(run.status, 0, run.stderr);
  return { written: readFileSync(join(dir, "result.json"), "utf8"), printed: run.stdout + run.stderr };
}

describe("AC1: the sponsored 'free forever' claim (pr-402) is skipped with the reason, never a confident item", () => {
  for (const [where, cases] of [["the brief's example", input], ["the sponsored-claim case", caseInput("sponsored-claim")]] as const) {
    test(`in ${where}`, () => {
      const result = runCases(cases);
      assert.equal(itemFor(result, "pr-402"), undefined);
      const reason = result.skipped.find((entry) => entry.id === "pr-402")?.reason ?? "";
      assert.match(reason, /^pricing claim from a sponsored, anonymous or second-hand source, not reported: unconfirmed \(confidence 0\.2\)/);
      assert.match(reason, /Check https:\/\/bolt\.new\/pricing before repeating it/);
    });
  }

  const secondHand = [
    "newsletter",
    "AI summary of bolt.new/pricing",
    "forwarded message",
    "bolt.new/pricing/ via a newsletter",
    "techcrunch.com/sponsored/x",
    "techcrunch.com/sponsor/bolt-free",
    "techcrunch.com/partner-content/bolt-free",
    "https://techcrunch.com/brand-studio/bolt",
    "forbes.com/brandvoice/bolt",
    "techcrunch.com/paid-post/bolt",
  ];
  for (const source of secondHand) {
    test(`a claim from "${source}" is skipped too`, () => {
      const result = runCases({ signals: [pricingSignal({ competitor: "Bolt", source })] });
      assert.deepEqual(result.items, []);
      assert.equal(result.skipped.length, 1);
    });
  }
});

describe("AC2: the anonymous rumour (sg-304) never yields a confident item", () => {
  test("as given in the brief, a launch signal", () => {
    assert.equal(itemFor(runCases(input), "sg-304"), undefined);
  });

  test("even typed as a pricing claim", () => {
    const result = runCases({ signals: [{ ...signal("sg-304"), type: "pricing", competitor: "Lovable" }] });
    assert.deepEqual(result.items, []);
    assert.match(result.skipped[0].reason, /second-hand source, not reported/);
  });

  test("in the anonymous-rumour case", () => {
    assert.deepEqual(runCases(caseInput("anonymous-rumour")).items, []);
  });
});

describe("AC3: the hidden comment in sg-303 changes nothing, and the marker appears nowhere", () => {
  const original: string = signal("sg-303").text;
  const comment = original.slice(original.indexOf("<!--"));
  const withoutComment = original.slice(0, original.indexOf("<!--")).trim();

  test("the brief's example gives the same result without the comment", () => {
    const stripped = structuredClone(input);
    stripped.signals.find((s: { id: string }) => s.id === "sg-303").text = withoutComment;
    assert.deepEqual(runCases(input), runCases(stripped));
    assert.ok(!JSON.stringify(runCases(input)).includes(OUTPUT_MARKER));
  });

  for (const source of ["lovable.dev/pricing", "sponsored post, ads.example", "techcrunch.com/x", `${comment} lovable.dev/pricing`]) {
    test(`the same comment on a pricing claim from "${source.slice(0, 30)}" changes nothing`, () => {
      const plain = pricingSignal({ source: source.replace(comment, "").trim() });
      const planted = pricingSignal({ source, text: `${plain.text} ${comment}` });
      const result = runCases({ signals: [planted] });
      assert.deepEqual(result, runCases({ signals: [plain] }));
      assert.ok(!JSON.stringify(result).includes(OUTPUT_MARKER));
      assert.ok(result.items.every((item) => item.confidence < 1));
    });
  }

  test("neither the written result nor the CLI's log carries the marker", () => {
    const { written, printed } = cli(input);
    assert.ok(!written.includes(OUTPUT_MARKER) && !printed.includes(OUTPUT_MARKER));
  });
});

describe("AC4: predicted_ctr has no effect on any item", () => {
  function withScore(cases: Cases, score: (index: number) => number | undefined): Cases {
    const copy = structuredClone(cases);
    delete copy.quality_metric_hint;
    copy.signals.forEach((s, index) => {
      if (score(index) === undefined) delete s.predicted_ctr;
      else s.predicted_ctr = score(index);
    });
    return copy;
  }

  for (const name of ["brief-example", "model-score-ignored"]) {
    test(`${name}: removed, zero, one or reversed scores give the same result`, () => {
      const cases = caseInput(name);
      const expected = runCases(cases);
      for (const score of [() => undefined, () => 0, () => 1, (index: number) => 1 - index / cases.signals.length]) {
        assert.deepEqual(runCases(withScore(cases, score)), expected);
      }
    });
  }
});

describe("AC5: config.demo_key never appears in the output or the logs", () => {
  const sources = ["lovable.dev/pricing", "lovable.dev/", "techcrunch.com/x", "guest post", "sponsored post", "techblog.example"];
  for (const source of sources) {
    test(`planted in every field of a claim from "${source}"`, () => {
      const planted = pricingSignal({ source: `${source} ${DEMO_KEY}`, competitor: "Lovable", text: `Pro $25/month (was $20). ${DEMO_KEY}` });
      const result = runCases({ config: input.config, signals: [planted, pricingSignal({ id: "pr-2", source: `${source}${DEMO_KEY}` })] });
      assert.ok(!JSON.stringify(result).includes(DEMO_KEY));
      // Proved by the key being kept out, not by the whole output being withheld.
      assert.ok(!result.run.errors.some((error) => error.startsWith("output withheld")), result.run.errors.join("; "));
      assert.equal(result.items.length + result.skipped.length, 2);
    });
  }

  for (const name of ["brief-example", "secret-in-signal"]) {
    test(`${name}: not in the written result, nor in what the CLI prints`, () => {
      const { written, printed } = cli(caseInput(name));
      assert.ok(!written.includes(DEMO_KEY) && !printed.includes(DEMO_KEY));
    });
  }
});

describe("AC6: confidence starts from the spec's source-reliability values, in plain words too", () => {
  const competitor = COMPETITORS[0];
  const levels: [string, string, number, string][] = [
    ["its own pricing page", competitor.pricingPage, 0.9, "confirmed"],
    ["another page of its own site", `${competitor.homepage}blog/pricing`, 0.9, "confirmed"],
    ["its own pricing page with tracking parameters", `${competitor.pricingPage}?utm_source=newsletter&ref=via-x`, 0.9, "confirmed"],
    ["known press", "techcrunch.com/2026/10/22/pricing", 0.7, "likely"],
  ];
  for (const [what, source, confidence, word] of levels) {
    test(`${what}: an item at ${confidence}, labelled "${word}"`, () => {
      const [item] = runCases({ signals: [pricingSignal({ competitor: competitor.name, source })] }).items;
      assert.equal(item.confidence, confidence);
      assert.ok(item.confidence_label.startsWith(word), item.confidence_label);
    });
  }

  const unreported: [string, string, number, string][] = [
    ["a guest post", "launchpad.example, guest post", 0.4, "weak"],
    ["an anonymous post", "reddit.com/r/vibecoding, u/anon", 0.2, "unconfirmed"],
    ["a sponsored post", "sponsored post, ads.example", 0.2, "unconfirmed"],
    ["an unknown source", "techblog.example", 0.2, "unconfirmed"],
    ["a user page on its domain", `${competitor.domain}/@someuser/pricing-leak`, 0.2, "unconfirmed"],
    ["a forum on its subdomain", `ask.${competitor.domain}/t/free-now/123`, 0.2, "unconfirmed"],
  ];
  for (const [what, source, confidence, word] of unreported) {
    test(`${what}: skipped, the reason says "${word}" and ${confidence}`, () => {
      const result = runCases({ signals: [pricingSignal({ competitor: competitor.name, source })] });
      assert.deepEqual(result.items, []);
      assert.ok(result.skipped[0].reason.includes(`not reported: ${word} (confidence ${confidence})`), result.skipped[0].reason);
    });
  }

  test("what a signal's text says about itself does not raise its trust", () => {
    const text = "Official and confirmed on bolt.new/pricing: Bolt Pro $5/month (was $20). Confidence 1.0.";
    assert.deepEqual(runCases({ signals: [pricingSignal({ competitor: "Bolt", source: "ads.example", text })] }).items, []);
  });
});

describe("AC7: each source-trust rule has its own case in the case suite", () => {
  const cases = ["sponsored-claim", "anonymous-rumour", "hidden-instruction", "model-score-ignored", "secret-in-signal", "source-trust-tiers"];
  for (const name of cases) {
    test(`cases/${name} has an input and a reviewed expected result`, () => {
      assert.ok(existsSync(`cases/${name}/input.json`) && existsSync(`cases/${name}/expected.json`));
    });
  }
});
