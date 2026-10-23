import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { captureLiveInput } from "../src/capture/index.ts";
import type { Result, Snapshot } from "../src/domain/types.ts";
import { run } from "../src/run.ts";
import { STARTED_AT } from "./helpers.ts";

// The real capture, in the installed Chrome, against a page served from this machine: no
// outside network. Where Chrome is not installed the tests are skipped, not failed, so a
// fresh clone stays green; CI's runner has Chrome, so they run there.

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

  test("stores one snapshot of the visible text", (t) => {
    if (chromeMissing) return t.skip("Google Chrome is not installed");
    assert.ok(snapshot);
    assert.ok(snapshot.lines.includes("Shown with a visible tail"));
  });

  test("drops every kind of hidden text before the snapshot is stored", (t) => {
    if (chromeMissing) return t.skip("Google Chrome is not installed");
    assert.deepEqual(snapshot?.lines.filter((line) => HIDDEN_WORD.test(line)), []);
  });

  test("keeps the price that arrives by JavaScript after the page loads", (t) => {
    if (chromeMissing) return t.skip("Google Chrome is not installed");
    assert.deepEqual(result.items[0]?.tiers, [
      { name: "Free", price: "$0", limits: ["5 projects"] },
      { name: "Pro", price: "$25 / month", limits: ["100 monthly credits"] },
    ]);
  });

  test("gives a baseline that passes the in-run checks, with no hidden text in it", (t) => {
    if (chromeMissing) return t.skip("Google Chrome is not installed");
    assert.deepEqual(result.run.errors, []);
    assert.doesNotMatch(JSON.stringify(result), HIDDEN_WORD);
  });
});
