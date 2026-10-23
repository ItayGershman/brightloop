import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { before, describe, test, type TestContext } from "node:test";
import { captureLiveInput, storedSnapshots } from "../src/capture/index.ts";
import { competitorSlug } from "../src/config/competitors.ts";
import type { Result, RunInput, Snapshot, WatchedPage } from "../src/domain/types.ts";
import { run } from "../src/run.ts";
import { STARTED_AT } from "./helpers.ts";

// The real capture, in the installed Chrome, against pages served from this machine: no
// outside network. Where Chrome is not installed the tests are skipped, not failed, so a
// fresh clone stays green. CI's runner has Chrome, and there a missing Chrome fails the
// tests instead, so the proof cannot be skipped unnoticed.

/** Every hidden line in the fixture starts with this word; none may reach the output. */
const HIDDEN_WORD = /hidden-/;
const NO_CHROME = "could not start Google Chrome";

/** What the local server answers, by path: [content type, body]. */
const ROUTES: Record<string, [string, string]> = {
  "/pricing": ["text/html; charset=utf-8", readFileSync("tests/fixtures/hidden-text-pricing.html", "utf8")],
  "/prices.json": [
    "application/json",
    JSON.stringify({ name: "Pro", price: "$25", period: "/ month", limit: "100 monthly credits" }),
  ],
  "/redesigned": ["text/html; charset=utf-8", "<h1>Pricing</h1><p>Talk to us about plans.</p>"],
  "/bot-check": ["text/html; charset=utf-8", "<p>example.test</p><p>Performing security verification</p>"],
};

// Started before any test is defined, so every suite's setup can reach it.
const server = createServer((request, response) => {
  const route = ROUTES[request.url ?? ""];
  response.writeHead(route ? 200 : 404, { "content-type": route?.[0] ?? "text/plain" });
  response.end(route?.[1] ?? "not found");
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// Not closed by a hook (Node 18's runner has no file-level after); unref lets the process end.
server.unref();

/** One local page captured as Lovable's pricing page into a fresh snapshots folder. */
async function capture(path: string, snapshotsDir = mkdtempSync(join(tmpdir(), "brightloop-snapshots-"))) {
  const page: WatchedPage = { competitor: "Lovable", page: "pricing", url: `${origin}${path}` };
  const input = await captureLiveInput({ snapshotsDir, headless: true, pages: [page] });
  const stored = () => storedSnapshots(snapshotsDir, page);
  return { page, input, result: run(input, { startedAt: STARTED_AT }), stored };
}

/** True when the capture could not start Chrome: the test is skipped, except in CI, where it fails. */
function withoutChrome(input: RunInput, t: TestContext): boolean {
  if (!input.errors.some((error) => error.startsWith(NO_CHROME))) return false;
  assert.ok(!process.env.CI, "Google Chrome must be installed in CI, or the hidden-text proof is skipped");
  t.skip("Google Chrome is not installed");
  return true;
}

describe("a live capture of a pricing page with hidden text", () => {
  let input: RunInput;
  let result: Result;
  let snapshot: Snapshot | undefined;
  before(async () => {
    let stored: () => Snapshot[];
    ({ input, result, stored } = await capture("/pricing"));
    [snapshot] = input.errors.length === 0 ? stored() : [];
  });

  test("stores one snapshot of the visible text", (t) => {
    if (withoutChrome(input, t)) return;
    assert.ok(snapshot);
    assert.ok(snapshot.lines.includes("Shown with a visible tail"));
    assert.ok(snapshot.lines.includes("Shown below the fold"));
  });

  test("drops every kind of hidden text before the snapshot is stored", (t) => {
    if (withoutChrome(input, t)) return;
    assert.deepEqual(snapshot?.lines.filter((line) => HIDDEN_WORD.test(line)), []);
  });

  test("keeps the price that the page fetches by JavaScript after it loads", (t) => {
    if (withoutChrome(input, t)) return;
    assert.deepEqual(result.items[0]?.tiers, [
      { name: "Free", price: "$0", period: null, struck_price: null, billing: null, limits: ["5 projects"] },
      { name: "Pro", price: "$25", period: "/month", struck_price: null, billing: null, limits: ["100 monthly credits"] },
    ]);
  });

  test("gives a baseline that passes the in-run checks, with no hidden text in it", (t) => {
    if (withoutChrome(input, t)) return;
    assert.deepEqual(result.run.errors, []);
    assert.doesNotMatch(JSON.stringify(result), HIDDEN_WORD);
  });
});

describe("a live capture that cannot give a baseline", () => {
  test("a pricing page with no readable plans is reported as a changed page structure and not stored", async (t) => {
    const { page, input, result, stored } = await capture("/redesigned");
    if (withoutChrome(input, t)) return;
    assert.deepEqual(result.items, []);
    assert.deepEqual(stored(), []);
    assert.deepEqual(result.run.errors, [
      `${page.url}: page structure changed, check by hand; no plans could be read, so the snapshot was not stored`,
    ]);
  });

  test("a bot-check page that answers 200 is reported and never stored", async (t) => {
    const { input, result, stored } = await capture("/bot-check");
    if (withoutChrome(input, t)) return;
    assert.deepEqual(stored(), []);
    assert.deepEqual(result.run.errors, ["Lovable pricing page: the site answered with a bot check, so it was not captured"]);
  });

  test("a page whose latest snapshot cannot be read is reported, and gets no second baseline", async (t) => {
    const snapshotsDir = mkdtempSync(join(tmpdir(), "brightloop-snapshots-"));
    const dir = join(snapshotsDir, competitorSlug("Lovable"), "pricing");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-10-19T06-30-00.000Z.json"), "{ not json");
    const { page, input, result } = await capture("/pricing", snapshotsDir);
    if (withoutChrome(input, t)) return;
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.run.errors, [`${page.url}: the latest stored snapshot could not be read, so this page was not judged`]);
  });
});
