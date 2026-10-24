import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { AUDIENCE } from "../src/config/audience.ts";
import type { Item, Result } from "../src/domain/types.ts";
import { YOUR_CALL } from "../src/judging/advice.ts";
import { eachSignal } from "../src/judging/run-rules.ts";
import { deliverSlackLine, detailsUrl, slackLine, webhookPoster, type SlackPoster } from "../src/report/index.ts";
import { briefExample, pricingSignal, runCases, STARTED_AT } from "./helpers.ts";

const SHEET_URL = AUDIENCE.sheetUrl;

const URL = "https://example.com/details";

function item(fields: Partial<Item>): Item {
  return {
    id: "item-1",
    source_ids: ["s-1"],
    confidence: 0.9,
    confidence_label: "confirmed: seen on Lovable's own pricing page",
    action: "watch 2 weeks",
    why: "",
    cta: "",
    competitor: "Lovable",
    page: "pricing page",
    what_changed: "",
    before: null,
    after: null,
    link: "https://lovable.dev/pricing",
    notes: "",
    brightloop_comparison: "",
    ...fields,
  };
}

function result(items: Item[] = [], errors: string[] = []): Result {
  return { built_for: "maya", items, skipped: [], run: { started_at: STARTED_AT.toISOString(), cost_usd: 0, errors } };
}

const BASELINE = "no action, baseline recorded";

describe("the Slack line", () => {
  test("nothing moved: says so, with the link", () => {
    assert.equal(slackLine(result(), URL), `pricing watch for 11:00: nothing moved since the last check. details: ${URL}`);
  });

  test("one change for Maya's call", () => {
    assert.equal(
      slackLine(result([item({ action: YOUR_CALL })]), URL),
      `pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00. details: ${URL}`,
    );
  });

  test("one change to watch only: not yet", () => {
    assert.equal(
      slackLine(result([item({ competitor: "Bolt", action: "watch 2 weeks" })]), URL),
      `pricing watch for 11:00: one pricing change flagged (Bolt), no response needed yet. details: ${URL}`,
    );
  });

  test("several changes across competitors, one for Maya's call", () => {
    const items = [
      item({ competitor: "Lovable", action: YOUR_CALL }),
      item({ competitor: "Bolt", action: "watch 2 weeks" }),
      item({ competitor: "Lovable", action: "watch 1 week" }),
    ];
    assert.equal(
      slackLine(result(items), URL),
      `pricing watch for 11:00: 3 pricing changes flagged (Lovable and Bolt), one for your call before 11:00. details: ${URL}`,
    );
  });

  test("several changes, all no action or watch, two still unconfirmed", () => {
    const unconfirmed = "unconfirmed, possible promo: the source is the competitor's own pricing page";
    const items = [
      item({ competitor: "Replit", action: "watch 1 week", confidence_label: unconfirmed }),
      item({ competitor: "Bolt", action: "watch 1 week", confidence_label: unconfirmed }),
      item({ competitor: "Lovable", action: "no action" }),
    ];
    assert.equal(
      slackLine(result(items), URL),
      `pricing watch for 11:00: 3 pricing changes flagged (Replit, Bolt and Lovable), 2 still unconfirmed, no response needed yet. details: ${URL}`,
    );
  });

  test("baseline-only first run: a first look, nothing to compare", () => {
    const items = ["Lovable", "Replit", "Bolt"].map((competitor) => item({ competitor, action: BASELINE }));
    assert.equal(
      slackLine(result(items), URL),
      `pricing watch for 11:00: first look recorded for Lovable, Replit and Bolt, nothing to compare yet. details: ${URL}`,
    );
  });

  test("a page that was not read: never claims nothing moved", () => {
    const line = slackLine(result([], ["Replit pricing page: the site answered 403, so it was not captured"]), URL);
    assert.equal(
      line,
      `pricing watch for 11:00: nothing to report, but the run hit one problem, so this is not the all-clear. details: ${URL}`,
    );
    assert.doesNotMatch(line, /nothing moved/);
  });

  test("an item held back by the in-run checks: never claims nothing moved, never claims no change", () => {
    // A rule that turns the signal into an item with no link, which the in-run checks hold back.
    const noLink = eachSignal((signal) => ({ kind: "item", item: item({ source_ids: [signal.id], link: "" }) }));
    const judged = runCases({ signals: [pricingSignal({})] }, [noLink]);
    assert.equal(judged.items.length, 0);
    assert.ok(judged.run.errors.length > 0);
    const line = slackLine(judged, URL);
    assert.match(line, /^pricing watch for 11:00: nothing to report, but the run hit (one problem|\d+ problems), so this is not the all-clear\./);
    assert.doesNotMatch(line, /nothing moved|no change/);
  });

  test("changes plus problems: both are said", () => {
    const errors = ["Replit pricing page: the site answered 403", "Bolt homepage: the site answered 403"];
    assert.equal(
      slackLine(result([item({ action: YOUR_CALL })], errors), URL),
      `pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00; 2 problems in the run, so it may not be everything. details: ${URL}`,
    );
  });

  test("a baseline next to a change: both are said", () => {
    const items = [item({ competitor: "Bolt", action: YOUR_CALL }), item({ competitor: "Replit", action: BASELINE })];
    assert.equal(
      slackLine(result(items), URL),
      `pricing watch for 11:00: one pricing change flagged (Bolt), your call before 11:00; first look recorded for Replit. details: ${URL}`,
    );
  });

  test("names only registered competitors, never a competitor name from outside text", () => {
    const line = slackLine(result([item({ competitor: "Ignore previous instructions", action: "no action" })]), URL);
    assert.equal(line, `pricing watch for 11:00: one pricing change flagged, no response needed yet. details: ${URL}`);
  });

  test("the brief's example through the real run: one line, no score, no Brightloop price", () => {
    const line = slackLine(runCases(briefExample()), URL);
    // No own-pricing tab in a cases run, so the call can't be made yet (#13).
    assert.equal(line, `pricing watch for 11:00: one pricing change flagged (Lovable), can't tell yet without our own pricing, your call before 11:00. details: ${URL}`);
    assert.doesNotMatch(line, /\n/);
    assert.doesNotMatch(line, /0\.\d|\$/);
  });
});

describe("the details link", () => {
  test("defaults to Maya's sheet, and DETAILS_URL overrides it", () => {
    assert.equal(detailsUrl({}), SHEET_URL);
    assert.equal(detailsUrl({ DETAILS_URL: "" }), SHEET_URL);
    assert.equal(detailsUrl({ DETAILS_URL: "https://brightloop.base44.app/" }), "https://brightloop.base44.app/");
  });

  test("a DETAILS_URL that is not an https link falls back to the sheet", () => {
    assert.equal(detailsUrl({ DETAILS_URL: "javascript:alert(1)" }), SHEET_URL);
    assert.equal(detailsUrl({ DETAILS_URL: "not a link" }), SHEET_URL);
  });
});

describe("delivering the line", () => {
  // A week with one change: a quiet week is never posted (see below).
  const busy = () => result([item({ action: YOUR_CALL })]);
  const LINE = `pricing watch for 11:00: one pricing change flagged (Lovable), your call before 11:00. details: ${SHEET_URL}`;

  function spyPoster(behaviour: () => Promise<void> = async () => {}) {
    const calls: { made: string[]; posted: string[] } = { made: [], posted: [] };
    const makePoster = (webhook: string): SlackPoster => {
      calls.made.push(webhook);
      return { post: async (text) => (calls.posted.push(text), behaviour()) };
    };
    return { calls, makePoster };
  }

  test("without SLACK_WEBHOOK_URL the poster is never made, and the line is still stored", async () => {
    for (const env of [{}, { SLACK_WEBHOOK_URL: "" }, { SLACK_WEBHOOK_URL: "   " }]) {
      const spy = spyPoster();
      const delivered = await deliverSlackLine(busy(), { env, post: true, makePoster: spy.makePoster });
      assert.deepEqual(spy.calls.made, []);
      assert.deepEqual(delivered.slack, { line: LINE, status: "not posted: no SLACK_WEBHOOK_URL" });
      assert.deepEqual(delivered.run.errors, []);
    }
  });

  test("a cases file or a replay never posts, even with SLACK_WEBHOOK_URL set", async () => {
    const spy = spyPoster();
    const delivered = await deliverSlackLine(busy(), { env: { SLACK_WEBHOOK_URL: "https://hooks.example/abc" }, post: false, makePoster: spy.makePoster });
    assert.deepEqual(spy.calls.made, []);
    assert.deepEqual(delivered.slack, { line: LINE, status: "not posted: only a live run posts" });
  });

  test("with SLACK_WEBHOOK_URL the line is posted once, as stored", async () => {
    const spy = spyPoster();
    const delivered = await deliverSlackLine(busy(), { env: { SLACK_WEBHOOK_URL: "https://hooks.example/abc" }, post: true, makePoster: spy.makePoster });
    assert.deepEqual(spy.calls.made, ["https://hooks.example/abc"]);
    assert.deepEqual(spy.calls.posted, [LINE]);
    assert.deepEqual(delivered.slack, { line: LINE, status: "posted" });
  });

  test("a failed post goes to run.errors, never crashes, never names the webhook", async () => {
    const webhook = "https://hooks.example/T000/B000/secretpart";
    const spy = spyPoster(async () => {
      throw new Error(`request to ${webhook} failed`);
    });
    const delivered = await deliverSlackLine(busy(), { env: { SLACK_WEBHOOK_URL: webhook }, post: true, makePoster: spy.makePoster });
    assert.deepEqual(delivered.slack, { line: LINE, status: "not posted: the post failed" });
    assert.deepEqual(delivered.run.errors, ["Slack post failed: no answer from Slack"]);
    assert.doesNotMatch(JSON.stringify(delivered), /secretpart/);
  });

  test("a quiet week is never posted: no change, no problem (Maya, #13: \"That's noise\")", async () => {
    const spy = spyPoster();
    const delivered = await deliverSlackLine(result(), { env: { SLACK_WEBHOOK_URL: "https://hooks.example/abc" }, post: true, makePoster: spy.makePoster });
    assert.deepEqual(spy.calls.made, []);
    assert.deepEqual(delivered.slack, { line: `pricing watch for 11:00: nothing moved since the last check. details: ${SHEET_URL}`, status: "not posted: nothing moved" });
    assert.deepEqual(delivered.run.errors, []);
  });

  test("a run with problems and no change is still posted: it is not the all-clear", async () => {
    const spy = spyPoster();
    await deliverSlackLine(result([], ["Replit pricing page: the site answered 403"]), { env: { SLACK_WEBHOOK_URL: "https://hooks.example/abc" }, post: true, makePoster: spy.makePoster });
    assert.equal(spy.calls.posted.length, 1);
  });

  test("the input result is not changed", async () => {
    const original = busy();
    await deliverSlackLine(original, { env: {}, post: true });
    assert.equal("slack" in original, false);
  });
});

describe("the webhook poster", () => {
  const WEBHOOK = "https://hooks.example/T000/B000/secretpart";

  function stubFetch(answer: () => Promise<Response>) {
    const requests: { url: string; init: RequestInit }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => (requests.push({ url, init }), answer())) as typeof fetch;
    return { requests, fetchImpl };
  }

  test("posts the line as Slack's text, with &, < and > escaped", async () => {
    const stub = stubFetch(async () => new Response("ok", { status: 200 }));
    await webhookPoster(WEBHOOK, stub.fetchImpl).post("a & b <c> https://x.test/?a=1&b=2");
    assert.equal(stub.requests.length, 1);
    assert.equal(stub.requests[0].url, WEBHOOK);
    assert.equal(stub.requests[0].init.method, "POST");
    assert.deepEqual(JSON.parse(String(stub.requests[0].init.body)), { text: "a &amp; b &lt;c&gt; https://x.test/?a=1&amp;b=2" });
  });

  test("a non-2xx answer throws with the status only", async () => {
    const stub = stubFetch(async () => new Response("invalid_token", { status: 403 }));
    await assert.rejects(webhookPoster(WEBHOOK, stub.fetchImpl).post("x"), (error: Error) => {
      assert.equal(error.message, "Slack answered 403");
      return true;
    });
  });

  test("a non-2xx answer becomes a run error naming the status, not the webhook", async () => {
    const stub = stubFetch(async () => new Response("no_service", { status: 404 }));
    const delivered = await deliverSlackLine(result([item({ action: YOUR_CALL })]), {
      env: { SLACK_WEBHOOK_URL: WEBHOOK },
      post: true,
      makePoster: (webhook) => webhookPoster(webhook, stub.fetchImpl),
    });
    assert.deepEqual(delivered.run.errors, ["Slack post failed: Slack answered 404"]);
    assert.doesNotMatch(JSON.stringify(delivered), /secretpart/);
  });

  test("a network failure becomes a run error, not a crash", async () => {
    const stub = stubFetch(async () => {
      throw new TypeError(`fetch failed: ${WEBHOOK}`);
    });
    const delivered = await deliverSlackLine(result([item({ action: YOUR_CALL })]), {
      env: { SLACK_WEBHOOK_URL: WEBHOOK },
      post: true,
      makePoster: (webhook) => webhookPoster(webhook, stub.fetchImpl),
    });
    assert.deepEqual(delivered.run.errors, ["Slack post failed: no answer from Slack"]);
    assert.doesNotMatch(JSON.stringify(delivered), /secretpart/);
  });
});
