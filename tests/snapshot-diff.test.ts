import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import { storedSnapshots, writeSnapshot } from "../src/capture/index.ts";
import { watchedPages } from "../src/config/competitors.ts";
import type { Item, Result } from "../src/domain/types.ts";
import { liveInput } from "../src/input/live-input.ts";
import { run } from "../src/run.ts";
import { landedIds, pricingSignal, runCases, STARTED_AT } from "./helpers.ts";
import { derivedPairs } from "./snapshot-pairs.ts";

// Issue #8: a live run with an earlier snapshot compares the two, line by line, and the
// changed lines become signals judged by the same rules. Every pair here is replayed through
// the same run(input) seam as a live run: a real committed snapshot and an edited copy of it
// (tests/fixtures/derived-snapshot-pairs/). No browser, no network, no keys.

function replay(name: string): Result {
  return run(liveInput(derivedPairs(name), []), { startedAt: STARTED_AT });
}

function only(items: Item[], competitor: string): Item {
  const found = items.filter((item) => item.competitor === competitor);
  assert.equal(found.length, 1, `one item for ${competitor}`);
  return found[0];
}

describe("acceptance criteria of #8", () => {
  test("a recorded pair with a plan-limit change yields an item with before, after and link taken from the diff", () => {
    const result = replay("plan-limit-change");
    assert.deepEqual(result.run.errors, []);
    const item = only(result.items, "Lovable");
    assert.equal(item.before, "100 monthly credits");
    assert.equal(item.after, "150 monthly credits");
    assert.equal(item.link, "https://lovable.dev/pricing");
    assert.match(item.what_changed, /"100 monthly credits" is now "150 monthly credits"/);
    assert.deepEqual(landedIds(result), ["change-lovable-pricing-pro"]);
  });

  test('a recorded pair with only a homepage headline change yields a skipped signal with "homepage copy, no action"', () => {
    const result = replay("homepage-headline");
    assert.deepEqual(result.run.errors, []);
    assert.deepEqual(result.items, []);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].id, "copy-bolt-homepage");
    assert.match(result.skipped[0].reason, /^homepage copy, no action/);
  });

  test('a recorded pair with no changes yields a clear "nothing moved" result', () => {
    const result = replay("nothing-moved");
    assert.deepEqual(result.run.errors, []);
    assert.deepEqual(result.items, []);
    assert.equal(result.skipped.length, 6);
    for (const entry of result.skipped) assert.match(entry.reason, /^nothing moved: /);
    assert.match(result.skipped[0].reason, /^nothing moved: Lovable's pricing page is the same as in the snapshot of 2026-10-23T08:24:20.861Z$/);
  });

  test('a restructured page yields "page structure changed, check by hand" in run.errors and no invented number', () => {
    const result = replay("restructured-page");
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.skipped, []);
    assert.equal(result.run.errors.length, 1);
    assert.match(result.run.errors[0], /^https:\/\/lovable\.dev\/pricing: page structure changed, check by hand/);
    // The redesigned page shows new prices; none of them may reach the output as a reading.
    assert.doesNotMatch(JSON.stringify(result), /\$30|\$60/);
  });

  test("the proof replays recorded pairs with zero keys", () => {
    // A snapshots folder holding the real history plus one derived later snapshot, replayed
    // by the CLI in a process that has no environment beyond PATH: no keys, no tokens.
    const dir = mkdtempSync(join(tmpdir(), "brightloop-replay-"));
    for (const page of watchedPages()) {
      for (const snapshot of storedSnapshots("snapshots", page)) writeSnapshot(dir, snapshot);
    }
    for (const { current } of derivedPairs("plan-limit-change")) writeSnapshot(dir, current);
    const output = join(dir, "result.json");
    const cli = spawnSync("./run", ["--replay", "--snapshots", dir, "--output", output], {
      encoding: "utf8",
      env: { PATH: process.env.PATH },
    });
    assert.equal(cli.status, 0, cli.stderr);
    const result: Result = JSON.parse(readFileSync(output, "utf8"));
    assert.deepEqual(result.run.errors, []);
    assert.equal(result.run.cost_usd, 0);
    const lovable = result.items.find((item) => item.id === "pricing-change-lovable-pricing-pro");
    assert.equal(lovable?.after, "150 monthly credits");
    // The other pages have one snapshot each, so they replay as baselines.
    assert.deepEqual(
      result.items.map((item) => item.id).sort(),
      ["baseline-bolt", "baseline-replit", "pricing-change-lovable-pricing-pro"],
    );
  });
});

describe("only the lines that changed are judged", () => {
  // The live pages already carry promotion wording (Lovable's student "up to 50% off",
  // Replit's "Up to 10% off", Bolt's "Free forever, no card required" and its "*"). A plain
  // change next to that unchanged wording is a list-price or limit change, not a promotion.
  const result = replay("promotion-text-unchanged");

  test("passes the in-run checks, one item per changed page", () => {
    assert.deepEqual(result.run.errors, []);
    assert.deepEqual(result.items.map((item) => item.competitor).sort(), ["Bolt", "Lovable", "Replit"]);
  });

  const expected: Record<string, { before: string; after: string; kind: string }> = {
    Lovable: { before: "$25/month", after: "$20/month", kind: "price" },
    Replit: { before: "$18/month, billed annually (struck-out $20)", after: "$20/month, billed annually (struck-out $22)", kind: "price" },
    Bolt: { before: "1M tokens/month to try Bolt", after: "2M tokens/month to try Bolt", kind: "free plan" },
  };
  for (const [competitor, { before, after, kind }] of Object.entries(expected)) {
    test(`${competitor}: a ${kind} change on the lowest tier or free plan is "respond now", not a possible promo`, () => {
      const item = only(result.items, competitor);
      assert.equal(item.before, before);
      assert.equal(item.after, after);
      assert.equal(item.action, "respond now");
      assert.equal(item.confidence_label, `confirmed: seen on ${competitor}'s own pricing page`);
      assert.doesNotMatch(item.notes, /promo/i);
      assert.match(item.notes, new RegExp(`Changed lines: ${kind}\\.`));
    });
  }
});

describe("each changed line is classified", () => {
  test("a badge added next to a price drop is a promotion, never a price cut", () => {
    const result = replay("promotion-badge");
    const item = only(result.items, "Lovable");
    assert.equal(item.before, null);
    assert.equal(item.after, null);
    assert.equal(item.action, "watch 2 weeks");
    assert.match(item.notes, /Changed lines: price, promotion marker\./);
    assert.match(item.notes, /Promotion \("limited time" wording, discount wording\)/);
  });

  test("a line pushed between a plan's name and its price is a changed page structure, not a removed plan", () => {
    const result = replay("badge-between-name-and-price");
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.run.errors, [
      "https://lovable.dev/pricing: page structure changed, check by hand; a plan's name is still on the page but its price can no longer be read with it, so no change was reported",
    ]);
  });

  test("a plan removed while another is added is never read as a rename with a new price", () => {
    const result = replay("plan-replaced");
    assert.deepEqual(result.items, []);
    assert.equal(result.run.errors.length, 1);
    assert.match(result.run.errors[0], /^https:\/\/lovable\.dev\/pricing: page structure changed, check by hand/);
    assert.doesNotMatch(JSON.stringify(result), /\$10/);
  });

  test("plan cards shown in another order are copy only, not a plan change", () => {
    const result = replay("plan-cards-moved");
    assert.deepEqual(result.run.errors, []);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.skipped.map((entry) => entry.id), ["copy-lovable-pricing"]);
  });

  test("a dollar allowance on a plan is a limit, and the comparison shows the plan's own price", () => {
    const result = replay("dollar-lines");
    const item = only(result.items, "Replit");
    assert.equal(item.before, "$20 towards more powerful models");
    assert.equal(item.after, "$10 towards more powerful models");
    assert.match(item.notes, /Changed lines: limit\./);
    assert.match(item.brightloop_comparison, /Replit Core shows \$18\/month, billed annually \(struck-out \$20\)\.$/);
  });

  test("a plan's price lines that change while its price reads the same are checked by hand", () => {
    const result = replay("dollar-lines");
    assert.equal(result.items.filter((item) => item.competitor === "Bolt").length, 0);
    assert.deepEqual(result.run.errors, [
      "https://bolt.new/pricing: page structure changed, check by hand; the Pro plan's price lines changed but its price reads the same, so no change was reported",
    ]);
  });

  test("promotion wording outside every plan card belongs to the page, not to the last plan", () => {
    const result = replay("promotion-outside-plans");
    assert.deepEqual(result.run.errors, []);
    const item = only(result.items, "Lovable");
    assert.equal(item.id, "pricing-change-lovable-pricing");
    assert.match(item.what_changed, /^Lovable's pricing page: "2 months free; Verify student status/);
    assert.doesNotMatch(item.what_changed, /Enterprise/);
    assert.match(item.notes, /Changed lines: promotion marker\./);
  });

  test("a renamed plan is a plan name change; a reworded tagline is pricing page copy", () => {
    const result = replay("plan-renamed");
    assert.deepEqual(result.run.errors, []);
    const item = only(result.items, "Bolt");
    assert.equal(item.before, "Teams");
    assert.equal(item.after, "Team");
    assert.equal(item.action, "watch 2 weeks");
    assert.match(item.notes, /Changed lines: plan name\./);
    assert.deepEqual(result.skipped.map((entry) => entry.id), ["copy-bolt-pricing"]);
    assert.match(result.skipped[0].reason, /^pricing page copy, no action: 2 changed lines/);
  });

  test("an item says which snapshot it was compared with", () => {
    const item = only(replay("plan-limit-change").items, "Lovable");
    assert.match(item.notes, /Compared with the snapshot of 2026-10-23T08:24:20\.861Z\./);
  });
});

describe("a cases file cannot pose as a snapshot diff", () => {
  test("a diff field in a cases.json signal is ignored: before and after come only from a real diff", () => {
    const result = runCases({
      signals: [pricingSignal({ text: "Pro plan limits changed.", diff: { before: "$1", after: "$2", kinds: ["price"], since: "x", changedLines: 1 } })],
    });
    assert.equal(result.items[0].before, null);
    assert.equal(result.items[0].after, null);
  });
});
