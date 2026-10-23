import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { COMPETITORS, watchedPages } from "../src/config/competitors.ts";
import type { Snapshot } from "../src/domain/types.ts";
import { liveInput } from "../src/input/live-input.ts";
import { run } from "../src/run.ts";
import { landedIds, STARTED_AT } from "./helpers.ts";

// The first live run, replayed from the real snapshots committed under snapshots/: no
// browser, no network. Each watched page's earliest snapshot is the one a baseline came from.

function firstSnapshots(): Snapshot[] {
  return watchedPages().map((page) => {
    const dir = join("snapshots", page.competitor.toLowerCase(), page.page);
    const [first] = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
    return JSON.parse(readFileSync(join(dir, first), "utf8")) as Snapshot;
  });
}

describe("a live run with no earlier snapshot, from the committed snapshots", () => {
  const snapshots = firstSnapshots();
  const result = run(liveInput(snapshots.map((current) => ({ current })), []), { startedAt: STARTED_AT });

  test("has a committed snapshot of all 6 watched pages, each with visible text", () => {
    assert.equal(snapshots.length, 6);
    for (const snapshot of snapshots) assert.ok(snapshot.lines.length > 0, snapshot.url);
  });

  test("passes the in-run checks, and every page lands exactly once", () => {
    assert.deepEqual(result.run.errors, []);
    assert.deepEqual(landedIds(result), snapshots.map((s) => `baseline-${s.competitor.toLowerCase()}-${s.page}`).sort());
  });

  test("records each homepage as a skipped signal: copy, no action", () => {
    assert.deepEqual(
      result.skipped.map((entry) => entry.reason),
      COMPETITORS.map(() => "homepage baseline recorded: homepage copy, no action"),
    );
  });

  for (const competitor of COMPETITORS) {
    test(`gives ${competitor.name} one baseline item with its plans, prices, limits and link`, () => {
      const items = result.items.filter((item) => item.competitor === competitor.name);
      assert.equal(items.length, 1);
      const [item] = items;
      assert.equal(item.action, "no action, baseline recorded");
      assert.equal(item.link, competitor.pricingPage);
      assert.equal(item.before, null);
      assert.ok(item.tiers && item.tiers.length >= 2, "at least two plans");
      for (const tier of item.tiers) assert.ok(tier.name && tier.price, `${tier.name} has a price`);
      assert.ok(item.tiers.some((tier) => tier.limits.length > 0), "limits are read");
      assert.equal(item.after, item.tiers.map((tier) => `${tier.name} ${tier.price}`).join("; "));
    });
  }
});

describe("a live run where a page cannot become a baseline", () => {
  const [pricing] = firstSnapshots();

  test("a page with an earlier snapshot is reported, not judged, until comparing snapshots is built", () => {
    const result = run(liveInput([{ current: pricing, earlier: pricing }], []), { startedAt: STARTED_AT });
    assert.deepEqual(landedIds(result), []);
    assert.deepEqual(result.run.errors, [
      `${pricing.url} has an earlier snapshot; comparing snapshots is not built yet, so it was not judged`,
    ]);
  });

  test("a pricing page with no readable plans is skipped as a changed page structure", () => {
    const result = run(liveInput([{ current: { ...pricing, lines: ["Pricing", "Contact us"] } }], []), { startedAt: STARTED_AT });
    assert.deepEqual(result.items, []);
    assert.match(result.skipped[0].reason, /page structure changed, check by hand$/);
  });

  test("pages that could not be captured are reported in run.errors", () => {
    const result = run(liveInput([], ["Replit homepage: the site answered 403, so it was not captured"]), { startedAt: STARTED_AT });
    assert.deepEqual(result.run.errors, ["Replit homepage: the site answered 403, so it was not captured"]);
  });
});
