import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { Item } from "../src/domain/types.ts";
import { CANT_TELL, isTheirCall } from "../src/judging/advice.ts";
import { PRICE } from "../src/text/patterns.ts";
import { briefExample, pricingSignal, runCases } from "./helpers.ts";

// One block per acceptance criterion of issue #4, in its order, all through the run(input) seam.

function itemFor(fields: Record<string, unknown>): Item {
  const result = runCases({ signals: [pricingSignal(fields)] });
  assert.deepEqual(result.run.errors, []);
  assert.equal(result.items.length, 1);
  return result.items[0];
}

/** Everything an item says in words, where a price cut could be claimed. */
function wording(item: Item): string {
  return [item.confidence_label, item.action, item.why, item.cta, item.notes, item.brightloop_comparison].join("\n");
}

function assertNotAPriceCut(item: Item) {
  assert.equal(item.before, null, "a promotion has no before price");
  assert.equal(item.after, null, "a promotion has no after price");
  assert.ok(!isTheirCall(item.action), "a promotion is watched, never put to the audience as a list-price change");
  assert.doesNotMatch(wording(item), /(?<!not a list-)price cut|\bcut (?:its |their )?prices?|now cheaper/i);
  assert.match(item.notes, /not (?:reported as )?a list-price change/);
}

describe("AC1: a promotion badge never yields a price cut", () => {
  const badges: [string, Record<string, unknown>][] = [
    ['"% off" and "limited time" wording', { text: "Pro plan 30% off: $17.50/month (was $25). Limited time." }],
    ["a /promo path", { source: "lovable.dev/pricing/promo", text: "Pro plan $15/month (was $25)." }],
    ["a promo query parameter", { source: "https://lovable.dev/pricing?promo=fall", text: "Pro plan $15/month (was $25)." }],
    ["an expiry date", { text: "Pro plan $15/month (was $25), offer ends Oct 31." }],
    ["an introductory price", { text: "Pro plan $12.50/month for the first 3 months (was $25)." }],
    ["a known-press report of a cut", { source: "https://techcrunch.com/2026/10/23/lovable-pricing", text: "Lovable cut prices: Pro now $17.50/month (was $25), 30% off." }],
  ];
  for (const [marker, fields] of badges) {
    test(`with ${marker}`, () => assertNotAPriceCut(itemFor(fields)));
  }

  test("a second-hand claim of a cut is never an item at all", () => {
    const result = runCases({ signals: [pricingSignal({ source: "AI summary forwarded in Slack", text: "Lovable cut prices: Pro now $17.50/month (was $25), 30% off." })] });
    assert.deepEqual(result.items, []);
    assert.equal(result.skipped.length, 1);
  });

  test("on the official page, it says it is a promotion and what would make it a list-price change", () => {
    const item = itemFor(badges[0][1]);
    assert.match(item.why, /this is a promotion \(.*\), not a list-price change/);
    assert.match(item.why, /What would change the answer: .*after the promotion ends/);
  });

  test("a promotion marker hidden in an HTML comment does not count, so a real list-price change stays one", () => {
    const item = itemFor({ text: "Pro plan shown at $30/month (was $25 last week). <!-- limited time, 50% off -->" });
    assert.equal(item.before, "$25");
    assert.equal(item.after, "$30/month");
  });
});

describe("AC2: an undecidable case yields \"unconfirmed, possible promo\" with the check needed", () => {
  const undecidable: [string, string, RegExp][] = [
    ["fine print", "Pro plan now $20/month* (was $25).", /read the fine print next to the price on https:\/\/lovable\.dev\/pricing/],
    ["a bare percentage", "Pro plan 20% cheaper: $20/month (was $25).", /whether the percentage is a discount on the list price or a new list price/],
    ['"free forever" wording', "Free plan is now free forever with more daily tokens.", /whether the free plan itself changed or "free forever" is promotional wording/],
  ];
  for (const [marker, text, check] of undecidable) {
    test(`with ${marker}`, () => {
      const item = itemFor({ text });
      assert.match(item.confidence_label, /^unconfirmed, possible promo/);
      assert.match(item.cta, /^Check still needed/);
      assert.match(item.cta, check);
      assert.match(item.cta, /compare with last week's price/);
      assert.equal(item.after, null);
      assert.match(item.action, /^watch \d+ weeks?$/);
    });
  }

  test("a clear list-price change on the official page is not flagged as a possible promo", () => {
    assert.match(itemFor({}).confidence_label, /^confirmed/);
  });
});

describe("AC3: the lowest paid tier is the audience's call (here \"can't tell yet\": no own pricing, #13); a higher tier yields watch N weeks with what would change the answer", () => {
  const lowest: [string, Record<string, unknown>][] = [
    ["Lovable Pro, its lowest paid tier", { text: "Pro plan shown at $30/month (was $25 last week)." }],
    ["Replit Core, its lowest paid tier", { competitor: "Replit", source: "replit.com/pricing", text: "Core plan now $30/month (was $25)." }],
    ["what Bolt's free plan includes", { competitor: "Bolt", source: "bolt.new/pricing", text: "Free plan daily token limit lowered to 100k, down from 150k." }],
    ["what Lovable's plan named Free includes", { text: "Free now includes 3 projects, down from 5." }],
    ["Lovable Pro, with its name in Markdown bold", { text: "**Pro** plan now $30/month (was $25)." }],
    ["Lovable Pro, a price rise stated as a percentage", { text: "Pro plan price up 20%: $30/month (was $25)." }],
    ["what Replit's free plan includes", { competitor: "Replit", source: "replit.com/pricing", text: "Free plan now includes 3 apps, down from 10." }],
  ];
  for (const [what, fields] of lowest) {
    test(`a change to ${what} is the audience's call, and without own pricing it can't tell yet`, () => {
      const item = itemFor(fields);
      assert.equal(item.action, CANT_TELL);
      assert.match(item.why, /Should we respond\? Can't tell yet: there is no comparison with our own pricing\./);
    });
  }

  const higher: [string, Record<string, unknown>][] = [
    ["Lovable Business", { text: "Business plan shown at $60/month (was $50 last week)." }],
    ["Bolt Teams", { competitor: "Bolt", source: "bolt.new/pricing", text: "Teams plan now $35/month per member (was $30)." }],
    ["Replit Pro", { competitor: "Replit", source: "replit.com/pricing", text: "Pro plan now $120/month (was $100)." }],
  ];
  for (const [what, fields] of higher) {
    test(`a change to ${what}, a higher tier, yields watch N weeks with what would change the answer`, () => {
      const item = itemFor(fields);
      assert.match(item.action, /^watch \d+ weeks?$/);
      assert.match(item.why, /What would change the answer: .* lowest paid tier or its free plan/);
    });
  }

  test("a change that names no plan is watched until the plan is known, never put to the audience", () => {
    const item = itemFor({ text: "New monthly price shown at $30/month (was $25)." });
    assert.match(item.action, /^watch \d+ weeks?$/);
    assert.match(item.why, /What would change the answer/);
  });

  test("a change naming two plans is watched until the plan is known, never put to the audience", () => {
    const item = itemFor({ competitor: "Bolt", source: "bolt.new/pricing", text: "Pro Teams bundle now $40/month (was $35)." });
    assert.equal(item.action, "watch 1 week");
    assert.match(item.why, /^Still cheaper than us on the Bolt plan that changed\?/);
  });

  const otherPeriods = ["Pro now $200 per year (was $25).", "Pro now $200 billed annually (was $25/month).", "Pro $25/month → $200/year."];
  for (const text of otherPeriods) {
    test(`prices for different periods are never compared: "${text}"`, () => {
      const item = itemFor({ text });
      assert.equal(item.before, null);
      assert.equal(item.after, null);
      assert.equal(item.action, "watch 1 week");
      assert.match(item.why, /are for different periods, so they are not compared/);
      assert.match(item.brightloop_comparison, /not compared with the earlier .*, which is for a different period/);
    });
  }

  test("a known-press report about the lowest paid tier is watched, not put to the audience, until the official page shows it", () => {
    const item = itemFor({ source: "https://techcrunch.com/2026/10/23/lovable-pricing" });
    assert.equal(item.action, "watch 1 week");
    assert.match(item.why, /Should we respond\? Not yet/);
  });
});

describe("AC4: why answers both leadership questions", () => {
  const items = [...runCases(briefExample()).items, itemFor({ text: "Business plan shown at $60/month (was $50 last week)." })];
  for (const item of items) {
    test(`${item.id}: still cheaper on that tier? and should we respond?`, () => {
      assert.match(item.why, /^Still cheaper than us on [^?]+\? Can't compare/);
      assert.match(item.why, /Should we respond\? (Your call|Can't tell yet|No|Not yet)\b/);
    });
  }

  test("the first question names the tier that changed", () => {
    assert.match(itemFor({}).why, /^Still cheaper than us on Lovable Pro\?/);
  });
});

describe("AC5: without own pricing, brightloop_comparison says it can't compare and shows the competitor's price; no sample numbers", () => {
  test("a list-price change shows the new list price", () => {
    const item = itemFor({});
    assert.match(item.brightloop_comparison, /^Can't compare: Brightloop's own-pricing tab is not connected/);
    assert.match(item.brightloop_comparison, /Lovable Pro now shows \$25\/month\./);
  });

  test("a price with no earlier one is still shown", () => {
    assert.match(itemFor({ text: "Pro plan listed at $25/month." }).brightloop_comparison, /Lovable Pro shows \$25\/month\./);
  });

  for (const text of ["Pro $25 → $20.", "Pro $25 -> $20.", "Pro price moved from $25 to $20."]) {
    test(`a price move shows the new price, not the old one: "${text}"`, () => {
      const item = itemFor({ text });
      assert.equal(item.before, "$25");
      assert.equal(item.after, "$20");
      assert.match(item.brightloop_comparison, /Lovable Pro now shows \$20\.$/);
    });
  }

  test('"down from" is read as a price move', () => {
    const item = itemFor({ text: "Pro plan now $25/month, down from $30/month." });
    assert.equal(item.before, "$30/month");
    assert.equal(item.after, "$25/month");
    assert.match(item.brightloop_comparison, /Lovable Pro now shows \$25\/month\.$/);
  });

  test("several prices with no stated order show none of them, only the pricing page", () => {
    const item = itemFor({ text: "Pro plan: $25 and $20 both appear on the page." });
    assert.match(item.brightloop_comparison, /Lovable Pro's current price is on https:\/\/lovable\.dev\/pricing\.$/);
  });

  test("with no price in the signal, it points at the competitor's pricing page instead of guessing", () => {
    assert.match(itemFor({ text: "Business plan now includes more seats." }).brightloop_comparison, /price is on https:\/\/lovable\.dev\/pricing/);
  });

  test("every price in every item of every case is quoted from that item's own signal", () => {
    for (const name of readdirSync("cases")) {
      for (const item of runCases(readFileSync(`cases/${name}/input.json`, "utf8")).items) {
        const quoted: string[] = item.what_changed.match(PRICE) ?? [];
        const written = wording(item).match(PRICE) ?? [];
        for (const price of written) assert.ok(quoted.includes(price), `${name}/${item.id} writes ${price}, which its signal does not state`);
      }
    }
  });
});

describe("AC6: each rule has its own case in the case suite", () => {
  const ruleCases: [string, (items: Item[]) => boolean][] = [
    ["promotion-badges", (items) => items.every((item) => item.before === null && item.after === null)],
    ["possible-promo", (items) => items.every((item) => item.confidence_label.startsWith("unconfirmed, possible promo"))],
    ["tier-actions", (items) => items.some((item) => isTheirCall(item.action)) && items.some((item) => /^watch/.test(item.action))],
    ["no-own-pricing", (items) => items.every((item) => item.brightloop_comparison.startsWith("Can't compare"))],
    ["price-readings", (items) => items.some((item) => item.before !== null) && items.some((item) => /different periods/.test(item.why))],
  ];
  for (const [name, showsRule] of ruleCases) {
    test(`cases/${name} exists, has an expected result, and shows its rule`, () => {
      assert.ok(existsSync(`cases/${name}/input.json`) && existsSync(`cases/${name}/expected.json`));
      const expected = JSON.parse(readFileSync(`cases/${name}/expected.json`, "utf8"));
      assert.ok(expected.items.length > 0 && showsRule(expected.items));
    });
  }
});
