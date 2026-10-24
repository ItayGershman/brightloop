import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, test } from "node:test";
import type { OwnPricing, Result } from "../src/domain/types.ts";
import { parseCasesFile } from "../src/input/parse-cases-file.ts";
import { liveInput } from "../src/input/live-input.ts";
import { renderPage } from "../src/page/index.ts";
import { slackLine } from "../src/report/index.ts";
import { run } from "../src/run.ts";
import { limitMove } from "../src/text/limit-change.ts";
import { readOwnPricing } from "../src/sheet/own-pricing.ts";
import { STARTED_AT } from "./helpers.ts";
import { derivedPairs } from "./snapshot-pairs.ts";

// Issue #13, Maya's reaction to a real output (interviews/maya.md, messages 14 and 15): the
// tool lays out the facts and leaves the call to her. It never says "respond now"; without
// the comparison with Brightloop's own pricing it says "can't tell yet"; more for the same
// price is watched for two weeks. Own-pricing rows are synthetic, built here for the test.

const YOUR_CALL = "your call before 11:00";
const CANT_TELL = "can't tell yet: compare with our own pricing before 11:00";

function tab(): OwnPricing {
  return readOwnPricing([["tier", "monthly price (USD)"], ["Test Free", "0"], ["Test Starter", "41.99"], ["Test Studio", "77.77"]]).ownPricing;
}

function runWith(ownPricing: OwnPricing | undefined, ...signals: Record<string, unknown>[]): Result {
  const input = parseCasesFile(JSON.stringify({ timezone: "Asia/Jerusalem", signals }));
  return run({ ...input, ownPricing }, { startedAt: STARTED_AT });
}

const lovablePro = { id: "s-1", type: "pricing", competitor: "Lovable", source: "lovable.dev/pricing", ts: "2026-10-23T08:00:00Z", text: "Pro plan shown at $30/month (was $25 last week)." };
const replitFree = { id: "s-2", type: "pricing", competitor: "Replit", source: "replit.com/pricing", ts: "2026-10-23T08:00:00Z", text: "Free plan now includes 3 apps, down from 10." };

describe("#13: a list-price change on the lowest paid tier is her call, with the facts", () => {
  test("with the own-pricing comparison: \"your call before 11:00\", the comparison first in why", () => {
    const [item] = runWith(tab(), lovablePro).items;
    assert.equal(item.action, YOUR_CALL);
    assert.match(item.why, /^Still cheaper than us on Lovable Pro\? Yes: /);
    assert.match(item.why, /Should we respond\? Your call: Pro is Lovable's lowest paid tier, the one most of our trials compare against\./);
    assert.equal(item.before, "$25");
    assert.equal(item.after, "$30/month");
  });

  test("without the comparison: \"can't tell yet\", and it says which comparison is missing", () => {
    const [item] = runWith(undefined, lovablePro).items;
    assert.equal(item.action, CANT_TELL);
    assert.match(item.why, /Should we respond\? Can't tell yet: there is no comparison with our own pricing\. /);
    assert.match(item.why, /compare it with the own-pricing tab, then decide/);
  });

  test("a comparison that can't be made (a price billed yearly) is also \"can't tell yet\"", () => {
    const [item] = runWith(tab(), { ...lovablePro, text: "Pro plan now $200 per year, was $180 per year." }).items;
    assert.equal(item.action, CANT_TELL);
  });

  test("less included on the free plan is her call too", () => {
    const [item] = runWith(tab(), replitFree).items;
    assert.equal(item.action, YOUR_CALL);
    assert.match(item.why, /Should we respond\? Your call: /);
  });
});

describe("#13: more for the same price is watched for two weeks, not urgent", () => {
  test("Lovable Pro from 100 to 150 monthly credits (the made-up week shown to Maya)", () => {
    const result = run(liveInput(derivedPairs("plan-limit-change"), []), { startedAt: STARTED_AT });
    const item = result.items.find((each) => each.competitor === "Lovable");
    assert.ok(item);
    assert.equal(item.action, "watch 2 weeks");
    assert.match(item.why, /Should we respond\? Not yet: Lovable Pro gives more for the same price, which is competitive but not urgent\./);
    assert.match(item.why, /What would change the answer: /);
  });

  test("a free plan that includes more", () => {
    const [item] = runWith(tab(), { ...replitFree, text: "Free plan now includes 10 apps, up from 3." }).items;
    assert.equal(item.action, "watch 2 weeks");
  });
});

describe("#13: before and after are filled in every time, a promotional price labelled", () => {
  test("Lovable Pro from $25 to $20 with a \"Limited time: 20% off\" line (the made-up week shown to Maya)", () => {
    const result = run(liveInput(derivedPairs("promotion-badge"), []), { startedAt: STARTED_AT });
    const item = result.items.find((each) => each.competitor === "Lovable");
    assert.ok(item);
    assert.equal(item.before, "$25/month");
    assert.equal(item.after, "$20/month (promotional)");
    assert.equal(item.action, "watch 2 weeks");
  });

  test("a possible promo is labelled as one", () => {
    const [item] = runWith(tab(), { ...lovablePro, text: "Pro plan now $20/month* (was $25)." }).items;
    assert.equal(item.before, "$25");
    assert.equal(item.after, "$20/month (possible promo, unconfirmed)");
  });

  test("prices for different periods are shown as stated, never compared", () => {
    const [item] = runWith(tab(), { ...lovablePro, text: "Pro now $200 per year (was $25)." }).items;
    assert.equal(item.before, "$25");
    assert.equal(item.after, "$200 per year");
    assert.equal(item.action, "watch 1 week");
  });
});

describe("#13: \"respond now\" appears nowhere", () => {
  for (const name of readdirSync("cases")) {
    test(`cases/${name}/expected.json`, () => {
      assert.doesNotMatch(readFileSync(`cases/${name}/expected.json`, "utf8"), /respond now|response now|needs a response/i);
    });
  }

  test("the Slack line and the page say it is her call", () => {
    const result = runWith(tab(), lovablePro);
    assert.equal(slackLine(result, "https://example.com"), "pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00. details: https://example.com");
    const html = renderPage({ result, timeZone: "Asia/Jerusalem" });
    assert.match(html, /1 change for your call before 11:00/);
    assert.doesNotMatch(html, /respond now|needs a response/i);
  });

  test("without the comparison the Slack line says it can't tell yet", () => {
    assert.equal(
      slackLine(runWith(undefined, lovablePro), "https://example.com"),
      "pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00, can't tell yet without our own pricing. details: https://example.com",
    );
  });
});

// Review of PR #32: a limit's direction is read from the number next to "up from" or "down
// from", before and after are filled from a stated limit pair or a single promotional price,
// and the Slack line names each change's call once.

describe("#13 review: a limit's direction is read from the number it belongs to", () => {
  test("a number earlier in the sentence is not the limit", () => {
    assert.equal(limitMove("Pro (25 users) now 3 apps, down from 10"), "less");
    assert.equal(limitMove("Pro (2 seats) now gives 10 apps, up from 3"), "more");
  });

  test("less on the lowest paid tier is never watched as more for the same price", () => {
    const [item] = runWith(undefined, { ...lovablePro, text: "Pro (25 users) now 3 apps, down from 10." }).items;
    assert.equal(item.action, CANT_TELL);
  });
});

describe("#13 review: before and after are filled from what the signal states", () => {
  test("a quoted limit pair", () => {
    const [item] = runWith(tab(), { ...lovablePro, text: 'Pro plan "100 monthly credits" is now "150 monthly credits".' }).items;
    assert.equal(item.before, "100 monthly credits");
    assert.equal(item.after, "150 monthly credits");
  });

  test("a limit up from an earlier number, with its unit", () => {
    const [item] = runWith(tab(), { ...replitFree, text: "Free plan now includes 10 apps, up from 3." }).items;
    assert.equal(item.before, "3 apps");
    assert.equal(item.after, "10 apps");
  });

  test("a promotion that states one price", () => {
    const [item] = runWith(tab(), { ...lovablePro, text: "Pro now $20/month, limited time 20% off." }).items;
    assert.equal(item.before, null);
    assert.equal(item.after, "$20/month (promotional)");
  });
});

describe("#13 review: the Slack line names each change's call once", () => {
  const replitCore = { ...lovablePro, id: "s-3", competitor: "Replit", source: "replit.com/pricing", text: "Core plan now $25/month (was $20)." };
  const boltYearly = { ...lovablePro, id: "s-4", competitor: "Bolt", source: "bolt.new/pricing", text: "Pro plan now $200 per year, was $180 per year." };
  const boltPro = { ...boltYearly, text: "Pro plan now $25/month (was $20)." };

  test("every change without the comparison", () => {
    assert.equal(
      slackLine(runWith(undefined, lovablePro, replitCore, boltPro), "https://example.com"),
      "pricing watch for 11:00: 3 pricing changes flagged (Lovable, Replit and Bolt), 3 for your call before 11:00, can't tell yet without our own pricing. details: https://example.com",
    );
  });

  test("one of three without the comparison", () => {
    assert.equal(
      slackLine(runWith(tab(), lovablePro, replitCore, boltYearly), "https://example.com"),
      "pricing watch for 11:00: 3 pricing changes flagged (Lovable, Replit and Bolt), 3 for your call before 11:00, 1 of them can't tell yet without our own pricing. details: https://example.com",
    );
  });
});
