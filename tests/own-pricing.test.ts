import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { OwnPricing, Result } from "../src/domain/types.ts";
import { parseCasesFile } from "../src/input/parse-cases-file.ts";
import { run } from "../src/run.ts";
import { readOwnPricing } from "../src/sheet/own-pricing.ts";
import { repoProblems } from "../scripts/marker-scan.ts";
import { firstRunInput, pricingSignal, STARTED_AT } from "./helpers.ts";

// Brightloop's own prices are read from the own-pricing tab at run time. These rows are
// synthetic, built here for the test: odd amounts no competitor page shows, so a test can
// prove that no Brightloop amount is ever written into an output.

const HEADER = ["tier", "monthly price (USD)", "billing", "notes"];
const SYNTHETIC_AMOUNTS = ["13.37", "41.99", "77.77"];

/** A tab whose cheapest paid tier costs more than every competitor's cheapest paid plan. */
function pricierTab(): string[][] {
  return [HEADER, ["Test Free", "0", "", ""], ["Test Starter", "41.99", "monthly", ""], ["Test Studio", "77.77", "monthly", ""]];
}

/** A tab whose cheapest paid tier costs less than every competitor's cheapest paid plan. */
function cheaperTab(): string[][] {
  return [HEADER, ["Test Starter", "$13.37", "monthly", ""], ["Test Studio", "77.77", "", ""]];
}

function own(values: string[][]): OwnPricing {
  return readOwnPricing(values).ownPricing;
}

function runWith(ownPricing: OwnPricing | undefined, ...signals: Record<string, unknown>[]): Result {
  const input = parseCasesFile(JSON.stringify({ timezone: "Asia/Jerusalem", signals }));
  return run({ ...input, ownPricing }, { startedAt: STARTED_AT });
}

function assertNoBrightloopAmount(value: unknown): void {
  const json = JSON.stringify(value);
  for (const amount of SYNTHETIC_AMOUNTS) assert.ok(!json.includes(amount), `output contains the Brightloop amount ${amount}`);
}

describe("reading the own-pricing tab", () => {
  test("reads each tier's name and monthly price by the header's column names", () => {
    const { ownPricing, errors } = readOwnPricing(pricierTab());
    assert.deepEqual(errors, []);
    assert.deepEqual(ownPricing, {
      state: "read",
      tiers: [
        { name: "Test Free", monthlyUsd: 0 },
        { name: "Test Starter", monthlyUsd: 41.99 },
        { name: "Test Studio", monthlyUsd: 77.77 },
      ],
    });
  });

  test("an empty tab, or one with only its header, is empty", () => {
    assert.deepEqual(own([]), { state: "empty" });
    assert.deepEqual(own([HEADER]), { state: "empty" });
    assert.deepEqual(own([HEADER, ["", "", "", ""]]), { state: "empty" });
  });

  test("a tab without the tier and monthly price columns cannot be read, and says which are missing", () => {
    const { ownPricing, errors } = readOwnPricing([["plan", "price"], ["Test", "5"]]);
    assert.deepEqual(ownPricing, { state: "unreadable" });
    assert.deepEqual(errors, ['own-pricing tab has no "tier" or "monthly price (USD)" column, so no comparison is made']);
  });

  test("a row whose price is not a number is left out, named by row number only, never by its value", () => {
    const { ownPricing, errors } = readOwnPricing([HEADER, ["Test Starter", "call us"], ["Test Studio", "77.77"]]);
    assert.deepEqual(ownPricing, { state: "read", tiers: [{ name: "Test Studio", monthlyUsd: 77.77 }] });
    assert.deepEqual(errors, ["own-pricing tab row 2 left out: its monthly price is not a number"]);
  });

  test("a tab whose every row is unreadable cannot be read", () => {
    assert.deepEqual(own([HEADER, ["Test Starter", "soon"]]), { state: "unreadable" });
  });
});

describe("the comparison with Brightloop, from the own-pricing tab", () => {
  const boltPro = pricingSignal({ id: "np-1", competitor: "Bolt", source: "bolt.new/pricing", text: "Pro plan shown at $30/month (was $25 last week)." });

  test("no tab connected: the comparison says it can't be made, as before", () => {
    const [item] = runWith(undefined, boltPro).items;
    assert.equal(
      item.brightloop_comparison,
      "Can't compare: Brightloop's own-pricing tab is not connected, so no Brightloop price is used. Bolt Pro now shows $30/month.",
    );
  });

  test("an empty tab: the comparison says it can't be made, and why", () => {
    const [item] = runWith(own([HEADER]), boltPro).items;
    assert.equal(
      item.brightloop_comparison,
      "Can't compare: Brightloop's own-pricing tab is empty, so no Brightloop price is used. Bolt Pro now shows $30/month.",
    );
    assert.match(item.why, /^Still cheaper than us on Bolt Pro\? Can't compare: Brightloop's own-pricing tab is empty/);
  });

  test("an unreadable tab: the comparison says it can't be made", () => {
    const [item] = runWith({ state: "unreadable" }, boltPro).items;
    assert.match(item.brightloop_comparison, /^Can't compare: Brightloop's own-pricing tab could not be read/);
  });

  test("a lowest paid plan is compared with Brightloop's cheapest paid tier: still cheaper", () => {
    const result = runWith(own(pricierTab()), boltPro);
    const [item] = result.items;
    assert.equal(
      item.brightloop_comparison,
      "Cheaper than Brightloop Test Starter: Bolt Pro now shows $30/month, below the monthly price in Brightloop's own-pricing tab.",
    );
    assert.match(item.why, /^Still cheaper than us on Bolt Pro\? Yes: Bolt Pro now shows \$30\/month, below Brightloop Test Starter's monthly price in the own-pricing tab\. Should we respond\?/);
    assertNoBrightloopAmount(result);
  });

  test("a lowest paid plan above Brightloop's cheapest paid tier: not cheaper", () => {
    const result = runWith(own(cheaperTab()), boltPro);
    const [item] = result.items;
    assert.equal(
      item.brightloop_comparison,
      "Not cheaper than Brightloop Test Starter: Bolt Pro now shows $30/month, above the monthly price in Brightloop's own-pricing tab.",
    );
    assert.match(item.why, /^Still cheaper than us on Bolt Pro\? No: /);
    assertNoBrightloopAmount(result);
  });

  test("the same price is said as the same, not as cheaper", () => {
    const [item] = runWith(own([HEADER, ["Test Starter", "30"]]), boltPro).items;
    assert.match(item.brightloop_comparison, /^Same price as Brightloop Test Starter: Bolt Pro now shows \$30\/month, the same as/);
  });

  test("a higher plan is compared with Brightloop's next paid tier up", () => {
    const signal = pricingSignal({ text: "Business plan now $50/month (was $45)." });
    const [item] = runWith(own(pricierTab()), signal).items;
    assert.match(item.brightloop_comparison, /^Cheaper than Brightloop Test Studio: Lovable Business now shows \$50\/month/);
  });

  test("a free plan change against a Brightloop free tier compares what each includes, not a price", () => {
    const signal = pricingSignal({ text: "Free plan now includes 5 daily credits instead of 10." });
    const [item] = runWith(own(pricierTab()), signal).items;
    assert.equal(
      item.brightloop_comparison,
      "Both free: Lovable's free plan and Brightloop Test Free cost nothing; compare what each includes on https://lovable.dev/pricing and in the own-pricing tab.",
    );
  });

  test("a free plan change when Brightloop has no free tier: they are cheaper", () => {
    const signal = pricingSignal({ text: "Free plan now includes 5 daily credits instead of 10." });
    const [item] = runWith(own(cheaperTab()), signal).items;
    assert.match(item.brightloop_comparison, /^Cheaper than Brightloop: Lovable's free plan costs nothing, and the own-pricing tab lists no free Brightloop tier\./);
  });

  test("a promotional price, or prices for different periods, are not compared", () => {
    const promo = pricingSignal({ source: "lovable.dev/pricing?promo=fall", text: "Pro plan $17.50/month, limited time." });
    const periods = pricingSignal({ text: "Pro plan now $200 per year (was $25)." });
    for (const item of runWith(own(pricierTab()), promo, { ...periods, id: "pr-2" }).items) {
      assert.match(item.brightloop_comparison, /^Can't compare with Brightloop: /, item.id);
    }
  });

  test("a price billed annually is not compared with a monthly one", () => {
    const signal = pricingSignal({ text: "Pro plan now $20/month billed annually (was $25)." });
    const [item] = runWith(own(pricierTab()), signal).items;
    assert.match(item.brightloop_comparison, /^Can't compare with Brightloop: the price is per year or billed yearly, and the own-pricing tab is monthly\./);
  });

  test("a change on no one plan is not compared", () => {
    const signal = pricingSignal({ text: "Pricing page now shows $50/month." });
    const [item] = runWith(own(pricierTab()), signal).items;
    assert.match(item.brightloop_comparison, /^Can't compare with Brightloop: the change does not name one Lovable plan\. Lovable shows \$50\/month\.$/);
  });

  test("a tier name that carries a number is not repeated: the tier is named by its place", () => {
    const [item] = runWith(own([HEADER, ["Starter 41.99", "41.99"]]), boltPro).items;
    assert.match(item.brightloop_comparison, /^Cheaper than Brightloop's cheapest paid tier: /);
    assertNoBrightloopAmount(item);
  });
});

describe("a baseline run with the own-pricing tab", () => {
  const input = firstRunInput();

  test("compares each competitor's lowest paid plan with Brightloop's cheapest paid tier", () => {
    const result = run({ ...input, ownPricing: own(pricierTab()) }, { startedAt: STARTED_AT });
    const lovable = result.items.find((item) => item.competitor === "Lovable");
    assert.equal(
      lovable?.brightloop_comparison,
      "Cheaper than Brightloop Test Starter: Lovable's lowest paid plan, Pro, shows $25/month, below the monthly price in Brightloop's own-pricing tab.",
    );
    assert.deepEqual(result.run.errors, []);
    assertNoBrightloopAmount(result);
  });

  test("a lowest paid plan billed annually is not set against a monthly price", () => {
    const result = run({ ...input, ownPricing: own(pricierTab()) }, { startedAt: STARTED_AT });
    const bolt = result.items.find((item) => item.competitor === "Bolt");
    assert.equal(
      bolt?.brightloop_comparison,
      "Can't compare with Brightloop: Bolt's lowest paid plan is billed yearly, and the own-pricing tab is monthly. Bolt's lowest paid plan, Pro, shows $18/month, billed annually.",
    );
  });

  test("an empty tab: the baseline says it can't compare yet", () => {
    const result = run({ ...input, ownPricing: own([HEADER]) }, { startedAt: STARTED_AT });
    for (const item of result.items) assert.match(item.brightloop_comparison, /^Can't compare yet: Brightloop's own-pricing tab is empty\./);
  });
});

describe("the repo check: no Brightloop price is committed", () => {
  // Built from parts, so this file itself never holds the pattern it tests.
  const brand = "Bright" + "loop";

  test("fails on a Brightloop price written next to the name", () => {
    for (const text of [`${brand} Starter $29/month`, `${brand}'s Pro: $49`, `${brand} = $9`, `${brand} Starter 29 USD`, `${brand} Starter 29/month`, `${brand} Pro 49 per month`]) {
      assert.deepEqual(repoProblems([{ path: "src/x.ts", text }]), ["src/x.ts: looks like a Brightloop price; Brightloop's prices are read from the own-pricing tab at run time, never committed"], text);
    }
  });

  test("passes the run's own wording, which names Brightloop and a competitor's price in one sentence", () => {
    const text = `Can't compare: ${brand}'s own-pricing tab is not connected, so no ${brand} price is used. Replit Core shows $25/month. Cheaper than ${brand} Test Starter: Bolt Pro now shows $30/month.`;
    assert.deepEqual(repoProblems([{ path: "cases/x/expected.json", text }]), []);
  });

  test("checks the docs too, but not captured pages or run outputs, which quote competitors' public pages", () => {
    const text = `${brand} Starter $29/month`;
    assert.equal(repoProblems([{ path: "DECISIONS.md", text }]).length, 1);
    assert.deepEqual(repoProblems([{ path: "snapshots/lovable/pricing/x.json", text }, { path: "runs/result.json", text }]), []);
  });
});
