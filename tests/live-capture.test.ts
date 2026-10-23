import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test, type TestContext } from "node:test";
import { captureLiveInput } from "../src/capture/index.ts";
import type { Result, Snapshot } from "../src/domain/types.ts";
import { run } from "../src/run.ts";
import { STARTED_AT } from "./helpers.ts";

// The real capture, in the installed Chrome, against a page served from this machine: no
// outside network. Where Chrome is not installed the tests are skipped, not failed, so a
// fresh clone stays green. CI's runner has Chrome, and there a missing Chrome fails the
// tests instead, so the proof cannot be skipped unnoticed.

const FIXTURE = readFileSync("tests/fixtures/hidden-text-pricing.html", "utf8");
const HIDDEN_WORD = /hidden-/;

describe("a live capture of a pricing page with hidden text", () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(FIXTURE);
  });
  const snapshotsDir = mkdtempSync(join(tmpdir(), "brightloop-snapshots-"));
  let result: Result;
  let snapshot: Snapshot | undefined;
  let chromeMissing = false;

  before(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pricing`;
    const input = await captureLiveInput({ snapshotsDir, headless: true, pages: [{ competitor: "Lovable", page: "pricing", url }] });
    chromeMissing = input.errors.some((error) => error.startsWith("could not start Google Chrome"));
    result = run(input, { startedAt: STARTED_AT });
    const dir = join(snapshotsDir, "lovable", "pricing");
    const [file] = chromeMissing ? [] : readdirSync(dir);
    snapshot = file ? (JSON.parse(readFileSync(join(dir, file), "utf8")) as Snapshot) : undefined;
  });
  after(() => server.close());

  /** True when the test must not run here; fails instead of skipping in CI. */
  const withoutChrome = (t: TestContext): boolean => {
    if (!chromeMissing) return false;
    assert.ok(!process.env.CI, "Google Chrome must be installed in CI, or the hidden-text proof is skipped");
    t.skip("Google Chrome is not installed");
    return true;
  };

  test("stores one snapshot of the visible text", (t) => {
    if (withoutChrome(t)) return;
    assert.ok(snapshot);
    assert.ok(snapshot.lines.includes("Shown with a visible tail"));
    assert.ok(snapshot.lines.includes("Shown below the fold"));
  });

  test("drops every kind of hidden text before the snapshot is stored", (t) => {
    if (withoutChrome(t)) return;
    assert.deepEqual(snapshot?.lines.filter((line) => HIDDEN_WORD.test(line)), []);
  });

  test("keeps the price that arrives by JavaScript after the page loads", (t) => {
    if (withoutChrome(t)) return;
    assert.deepEqual(result.items[0]?.tiers, [
      { name: "Free", price: "$0", period: null, struck_price: null, billing: null, limits: ["5 projects"] },
      { name: "Pro", price: "$25", period: "/month", struck_price: null, billing: null, limits: ["100 monthly credits"] },
    ]);
  });

  test("gives a baseline that passes the in-run checks, with no hidden text in it", (t) => {
    if (withoutChrome(t)) return;
    assert.deepEqual(result.run.errors, []);
    assert.doesNotMatch(JSON.stringify(result), HIDDEN_WORD);
  });
});

describe("a live capture of a page whose latest snapshot cannot be read", () => {
  test("reports it in run.errors and does not record a second baseline", async (t) => {
    const server = createServer((_request, response) => response.end(FIXTURE));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/pricing`;
      const snapshotsDir = mkdtempSync(join(tmpdir(), "brightloop-snapshots-"));
      mkdirSync(join(snapshotsDir, "lovable", "pricing"), { recursive: true });
      writeFileSync(join(snapshotsDir, "lovable", "pricing", "2026-10-19T06-30-00.000Z.json"), "{ not json");
      const input = await captureLiveInput({ snapshotsDir, headless: true, pages: [{ competitor: "Lovable", page: "pricing", url }] });
      if (input.errors.some((error) => error.startsWith("could not start Google Chrome"))) {
        assert.ok(!process.env.CI, "Google Chrome must be installed in CI");
        return t.skip("Google Chrome is not installed");
      }
      const result = run(input, { startedAt: STARTED_AT });
      assert.deepEqual(result.items, []);
      assert.deepEqual(result.run.errors, [`${url}: the latest stored snapshot could not be read, so this page was not judged`]);
    } finally {
      server.close();
    }
  });
});
