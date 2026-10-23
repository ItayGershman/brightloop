import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { Item, Result } from "../src/domain/types.ts";
import { base44Publisher, deliverPage, PublishError, publisherFromEnv, renderPage, type PagePublisher } from "../src/page/index.ts";
import type { RunLogEntry } from "../src/schedule/run-log.ts";
import { STARTED_AT } from "./helpers.ts";

const ZONE = "Asia/Jerusalem";
const WORKFLOW = readFileSync(".github/workflows/scheduled-run.yml", "utf8");

function item(fields: Partial<Item> = {}): Item {
  return {
    id: "item-1",
    source_ids: ["s-1"],
    confidence: 0.9,
    confidence_label: "confirmed: seen on Lovable's own pricing page",
    action: "respond now",
    why: "Lovable Pro is now $25/month; the comparison can't be made without the own-pricing tab.",
    cta: "Bring it to the 11:00 leadership meeting",
    competitor: "Lovable",
    page: "pricing page",
    what_changed: "Pro list price",
    before: "$20/month",
    after: "$25/month",
    link: "https://lovable.dev/pricing",
    notes: "",
    brightloop_comparison: "Can't compare: the own-pricing tab is not connected. Lovable Pro shows $25/month.",
    ...fields,
  };
}

function result(fields: Partial<Result> = {}): Result {
  return {
    built_for: "maya",
    items: [],
    skipped: [],
    run: { started_at: STARTED_AT.toISOString(), cost_usd: 0, errors: [] },
    ...fields,
  };
}

function entry(fields: Partial<RunLogEntry> = {}): RunLogEntry {
  return {
    started_at: STARTED_AT.toISOString(),
    pages_fetched: 6,
    pages_watched: 6,
    cost_usd: 0,
    errors: [],
    slack_line: "pricing watch for 11:00: nothing moved since the last check. details: https://example.com",
    slack_status: "posted",
    ...fields,
  };
}

/** The page's visible text, roughly: tags dropped, entities left as they are. */
function text(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "brightloop-page-"));
}

describe("the live page renderer", () => {
  test("shows every item with what changed, its action, why, confidence in words and its link", () => {
    const html = renderPage({ result: result({ items: [item()] }), timeZone: ZONE });
    const visible = text(html);
    assert.match(visible, /Lovable/);
    assert.match(visible, /Pro list price/);
    assert.match(visible, /\$20\/month/);
    assert.match(visible, /\$25\/month/);
    assert.match(visible, /respond now/);
    assert.match(visible, /comparison can't be made|can&#39;t be made/);
    assert.match(visible, /confirmed: seen on Lovable(&#39;|')s own pricing page/);
    assert.match(visible, /Bring it to the 11:00 leadership meeting/);
    assert.match(html, /<a href="https:\/\/lovable\.dev\/pricing"/);
  });

  test("never shows a bare score: the score sits after the words", () => {
    const visible = text(renderPage({ result: result({ items: [item()] }), timeZone: ZONE }));
    assert.match(visible, /confirmed: seen on Lovable\S* own pricing page \(0\.9 of 1\)/);
  });

  test("says when the run was, in Maya's time zone", () => {
    const visible = text(renderPage({ result: result(), timeZone: ZONE }));
    // 06:30 UTC on 26 October 2026 is 08:30 in Jerusalem, after the clocks went back.
    assert.match(visible, /Monday 26 October 2026, 08:30 Jerusalem time/);
  });

  test("hostile text from a signal is shown as text, never run as markup or script", () => {
    const hostile = `<script>alert("x")</script><img src=x onerror=alert(1)>"'&`;
    const html = renderPage({
      result: result({
        items: [item({ what_changed: hostile, why: hostile, notes: hostile, competitor: hostile, link: "javascript:alert(1)" })],
        skipped: [{ id: `sg-1${hostile}`, reason: hostile }],
        run: { started_at: STARTED_AT.toISOString(), cost_usd: 0, errors: [hostile] },
        slack: { line: hostile, status: "posted" },
      }),
      history: [entry({ errors: [hostile], slack_line: hostile })],
      timeZone: ZONE,
    });
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /href="javascript:/i);
    assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
    // Nothing on the page can load or run anything from elsewhere.
    assert.match(html, /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"/);
  });

  test("numbers from the run log are escaped too: a log line can hold anything", () => {
    const hostile = { ...entry(), pages_fetched: "<img src=x onerror=alert(1)>", pages_watched: "<b>6</b>" } as unknown as RunLogEntry;
    const html = renderPage({ result: result(), history: [hostile], timeZone: ZONE });
    assert.doesNotMatch(html, /<img|<b>6/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test("a link that is not http or https is shown as text, not as a link", () => {
    const html = renderPage({ result: result({ items: [item({ link: "lovable.dev/pricing" })] }), timeZone: ZONE });
    assert.doesNotMatch(html, /<a href="lovable/);
    assert.match(text(html), /lovable\.dev\/pricing/);
  });

  test("an empty run says nothing changed and nothing was skipped", () => {
    const visible = text(renderPage({ result: result(), timeZone: ZONE }));
    assert.match(visible, /No pricing changes this week/);
    assert.match(visible, /No signals were skipped/);
    assert.doesNotMatch(visible, /Problems in this run/);
  });

  test("a run with errors lists them and says it is not the all-clear", () => {
    const errors = ["Lovable homepage: the page answered 403, so it was not checked"];
    const visible = text(renderPage({ result: result({ run: { started_at: STARTED_AT.toISOString(), cost_usd: 0, errors } }), timeZone: ZONE }));
    assert.match(visible, /Problems in this run \(1\)/);
    assert.match(visible, /answered 403/);
    assert.match(visible, /not the all-clear/);
  });

  test("lists the skipped signals with their reasons", () => {
    const skipped = [
      { id: "ad-7", reason: "ad, outside Maya's job" },
      { id: "sg-303", reason: "sponsored claim, not backed by the official pricing page" },
    ];
    const visible = text(renderPage({ result: result({ skipped }), timeZone: ZONE }));
    assert.match(visible, /Skipped signals \(2\)/);
    assert.match(visible, /ad-7 .*ad, outside Maya(&#39;|')s job/);
    assert.match(visible, /sg-303 .*sponsored claim, not backed by the official pricing page/);
  });

  test("shows the Slack line as posted, or why it was not", () => {
    const line = "pricing watch for 11:00: one pricing change flagged (Lovable), it needs a response now. details: https://example.com";
    const posted = text(renderPage({ result: result({ slack: { line, status: "posted" } }), timeZone: ZONE }));
    assert.match(posted, /Posted to #leadership/);
    assert.match(posted, /one pricing change flagged \(Lovable\)/);
    const notPosted = text(renderPage({ result: result({ slack: { line, status: "not posted: the post failed" } }), timeZone: ZONE }));
    assert.match(notPosted, /not posted: the post failed/);
  });

  test("shows the run history newest first, with pages checked, problems and the Slack line", () => {
    const history = [
      entry({ started_at: "2026-10-19T05:30:00.000Z", pages_fetched: 5, errors: ["Lovable homepage answered 403"], slack_status: "not posted: no SLACK_WEBHOOK_URL" }),
      entry({ started_at: "2026-10-26T06:30:00.000Z" }),
    ];
    const visible = text(renderPage({ result: result(), history, timeZone: ZONE }));
    assert.match(visible, /Run history \(2 runs\)/);
    const newer = visible.indexOf("Monday 26 October 2026, 08:30");
    const older = visible.indexOf("Monday 19 October 2026, 08:30");
    assert.ok(newer > 0 && older > newer, "newest first");
    assert.match(visible, /5 of 6 pages/);
    assert.match(visible, /1 problem/);
    assert.match(visible, /not posted: no SLACK_WEBHOOK_URL/);
  });

  test("without a run history, says where the history is kept instead of an empty table", () => {
    const visible = text(renderPage({ result: result(), timeZone: ZONE }));
    assert.match(visible, /Run history: kept by the scheduled and manual runs/);
  });
});

describe("publishing the page", () => {
  const html = "<!doctype html><title>t</title>";

  test("zero keys: no publisher is built", () => {
    let built = false;
    const connect = () => {
      built = true;
      return { publish: async () => ({ url: "" }) };
    };
    assert.equal(publisherFromEnv({}, connect), undefined);
    assert.equal(publisherFromEnv({ BASE44_API_KEY: "  ", BASE44_APP_ID: "app" }, connect), undefined);
    assert.equal(publisherFromEnv({ BASE44_API_KEY: "key", BASE44_APP_ID: "" }, connect), undefined);
    assert.equal(built, false);
    assert.ok(publisherFromEnv({ BASE44_API_KEY: "key", BASE44_APP_ID: "app" }, connect));
    assert.equal(built, true);
  });

  test("zero keys: the page is written locally and nothing touches the network", async (t) => {
    t.mock.method(globalThis, "fetch", () => {
      throw new Error("no network call may happen");
    });
    const out = join(tempDir(), "runs", "result.html");
    const delivered = await deliverPage(result(), { pagePath: out, timeZone: ZONE, check: () => [] });
    assert.equal(delivered.status, "not published: no BASE44_API_KEY or BASE44_APP_ID");
    assert.deepEqual(delivered.result.run.errors, []);
    assert.match(readFileSync(out, "utf8"), /Competitor pricing watch/);
  });

  test("a failed publish is a run error, never a crash, and never names the key", async () => {
    const failing: PagePublisher = {
      publish: async () => {
        throw new PublishError("Base44 answered 401");
      },
    };
    const out = join(tempDir(), "result.html");
    const delivered = await deliverPage(result(), { pagePath: out, timeZone: ZONE, publisher: failing, check: () => [] });
    assert.equal(delivered.status, "not published: the upload failed");
    assert.deepEqual(delivered.result.run.errors, ["live page not updated: Base44 answered 401"]);
    assert.ok(existsSync(out));
  });

  test("an unexpected failure is reported without its message, which could hold anything", async () => {
    const failing: PagePublisher = {
      publish: async () => {
        throw new Error("secret-token-123 leaked in a message");
      },
    };
    const delivered = await deliverPage(result(), { pagePath: join(tempDir(), "p.html"), timeZone: ZONE, publisher: failing, check: () => [] });
    assert.deepEqual(delivered.result.run.errors, ["live page not updated: no answer from Base44"]);
  });

  test("Base44's own reason reaches the job log only, never run.errors", async () => {
    const failing: PagePublisher = {
      publish: async () => {
        throw new PublishError("Base44 answered 403", "owner someone@example.com has no publish permission");
      },
    };
    const delivered = await deliverPage(result(), { pagePath: join(tempDir(), "p.html"), timeZone: ZONE, publisher: failing, check: () => [] });
    assert.deepEqual(delivered.result.run.errors, ["live page not updated: Base44 answered 403"]);
    assert.equal(delivered.detail, "owner someone@example.com has no publish permission");
  });

  test("a page that cannot be written is a run error with its own status, never a crash", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "file"), "");
    const delivered = await deliverPage(result(), { pagePath: join(dir, "file", "p.html"), timeZone: ZONE, check: () => [] });
    assert.equal(delivered.status, "not published: the page could not be written");
    assert.deepEqual(delivered.result.run.errors, ["live page not updated: the page could not be written"]);
  });

  test("a page that fails the content check is not published", async () => {
    let published = false;
    const publisher: PagePublisher = {
      publish: async () => {
        published = true;
        return { url: "https://example.base44.app" };
      },
    };
    const delivered = await deliverPage(result(), {
      pagePath: join(tempDir(), "p.html"),
      timeZone: ZONE,
      publisher,
      check: () => ["looks like a Brightloop price"],
    });
    assert.equal(published, false);
    assert.equal(delivered.status, "not published: the page failed the content check");
    assert.deepEqual(delivered.result.run.errors, ["live page not updated: it failed the content check (looks like a Brightloop price)"]);
  });

  test("a successful publish returns the published URL and adds no error", async () => {
    const publisher: PagePublisher = { publish: async () => ({ url: "https://brightloop.base44.app" }) };
    const delivered = await deliverPage(result(), { pagePath: join(tempDir(), "p.html"), timeZone: ZONE, publisher, check: () => [] });
    assert.equal(delivered.status, "published");
    assert.equal(delivered.url, "https://brightloop.base44.app");
    assert.deepEqual(delivered.result.run.errors, []);
  });

  test("the Base44 publisher uploads index.html in a .tar.gz to deploy-dist with a bearer token", async () => {
    let request: { url: string; init: RequestInit } | undefined;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      request = { url, init };
      return new Response(JSON.stringify({ app_url: "https://brightloop.base44.app", deployed_at: "2026-10-26T06:31:00" }), { status: 200 });
    }) as unknown as typeof fetch;
    const published = await base44Publisher({ token: "tok", appId: "app123" }, fakeFetch).publish(html);
    assert.equal(published.url, "https://brightloop.base44.app");
    assert.ok(request);
    assert.equal(request.url, "https://app.base44.com/api/apps/app123/deploy-dist");
    assert.equal(request.init.method, "POST");
    assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer tok");
    const file = (request.init.body as FormData).get("file") as File;
    assert.match(file.name, /\.tar\.gz$/);

    // The archive holds index.html at its root, readable by the system's tar.
    const dir = tempDir();
    writeFileSync(join(dir, "page.tar.gz"), Buffer.from(await file.arrayBuffer()));
    mkdirSync(join(dir, "out"));
    const untar = spawnSync("tar", ["-xzf", join(dir, "page.tar.gz"), "-C", join(dir, "out")], { encoding: "utf8" });
    assert.equal(untar.status, 0, untar.stderr);
    assert.equal(readFileSync(join(dir, "out", "index.html"), "utf8"), html);
  });

  test("the Base44 publisher names the status of a refused upload, never the token", async () => {
    const refusing = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    await assert.rejects(base44Publisher({ token: "tok-secret", appId: "a" }, refusing).publish(html), (error: Error) => {
      assert.ok(error instanceof PublishError);
      assert.equal(error.message, "Base44 answered 403");
      return true;
    });
    const explained = (async () => new Response(JSON.stringify({ message: "Token tok-secret lacks   full access" }), { status: 401 })) as unknown as typeof fetch;
    // Base44 own words go in `detail`, for the job log; the message, which reaches the public page, is the status only.
    await assert.rejects(base44Publisher({ token: "tok-secret", appId: "a" }, explained).publish(html), {
      message: "Base44 answered 401",
      detail: "Token [token] lacks full access",
    });
    const silent = (async () => {
      throw new Error("tok-secret");
    }) as unknown as typeof fetch;
    await assert.rejects(base44Publisher({ token: "tok-secret", appId: "a" }, silent).publish(html), /^PublishError: no answer from Base44$|no answer from Base44/);
  });
});

describe("the page in the command line and the scheduled run", () => {
  test("a cases-file run writes the page beside result.json", () => {
    const output = join(tempDir(), "result.json");
    const run = spawnSync("./run", ["--input", "cases/brief-example/input.json", "--output", output], {
      encoding: "utf8",
      env: { ...process.env, SLACK_WEBHOOK_URL: "", BASE44_API_KEY: "" },
    });
    assert.equal(run.status, 0, run.stderr);
    const page = readFileSync(join(output, "..", "result.html"), "utf8");
    assert.match(text(page), /Lovable/);
    assert.match(run.stdout, /result\.html/);
  });

  test("the publish script renders this run with the run history and makes no network call without keys", () => {
    const dir = tempDir();
    const resultPath = join(dir, "result.json");
    const logPath = join(dir, "run-log.jsonl");
    const pagePath = join(dir, "result.html");
    writeFileSync(resultPath, JSON.stringify({ ...result({ items: [item()] }), slack: { line: "the line as posted", status: "posted" } }));
    writeFileSync(logPath, `${JSON.stringify(entry({ started_at: "2026-10-19T05:30:00.000Z", slack_line: "last week's line" }))}\n`);
    const script = spawnSync(
      "npx",
      ["tsx", "--import", "./tests/fixtures/no-network.ts", "scripts/publish-page.ts", STARTED_AT.toISOString(), resultPath, join(dir, "snapshots"), logPath, pagePath],
      { encoding: "utf8", env: { ...process.env, BASE44_API_KEY: "", BASE44_APP_ID: "" } },
    );
    assert.equal(script.status, 0, script.stderr);
    const visible = text(readFileSync(pagePath, "utf8"));
    assert.match(visible, /Run history \(2 runs\)/);
    assert.match(visible, /Monday 26 October 2026, 08:30/);
    assert.match(visible, /last week(&#39;|')s line/);
    assert.match(visible, /the line as posted/);
    assert.match(script.stdout, /not published: no BASE44_API_KEY/);
    // The run log itself is left to the next step.
    assert.equal(readFileSync(logPath, "utf8").trim().split("\n").length, 1);
  });

  test("the publish script records a failed publish in result.json, so the run log gets it", () => {
    const dir = tempDir();
    const resultPath = join(dir, "result.json");
    writeFileSync(resultPath, JSON.stringify(result()));
    const script = spawnSync(
      "npx",
      ["tsx", "--import", "./tests/fixtures/no-network.ts", "scripts/publish-page.ts", STARTED_AT.toISOString(), resultPath, join(dir, "snapshots"), join(dir, "log.jsonl"), join(dir, "p.html")],
      // Keys set, but the network is closed: the upload fails.
      { encoding: "utf8", env: { ...process.env, BASE44_API_KEY: "test-key", BASE44_APP_ID: "test-app" } },
    );
    assert.equal(script.status, 0, script.stderr);
    assert.doesNotMatch(script.stdout + script.stderr, /test-key/);
    const written = JSON.parse(readFileSync(resultPath, "utf8"));
    assert.deepEqual(written.run.errors, ["live page not updated: no answer from Base44"]);
  });

  test("the workflow publishes after the live run and before the run log, with the key on that step only", () => {
    const steps = WORKFLOW.split(/\n      - /);
    const publish = steps.find((step) => step.includes("scripts/publish-page.ts"));
    assert.ok(publish, "a publish step");
    assert.match(publish, /BASE44_API_KEY: \$\{\{ secrets\.BASE44_API_KEY \}\}/);
    assert.match(publish, /BASE44_APP_ID: \$\{\{ vars\.BASE44_APP_ID \}\}/);
    assert.equal(WORKFLOW.match(/secrets\.BASE44_API_KEY/g)?.length, 1);
    const at = (needle: string) => WORKFLOW.indexOf(needle);
    assert.ok(at("./run --live") < at("scripts/publish-page.ts"));
    assert.ok(at("scripts/publish-page.ts") < at("scripts/append-run-log.ts"));
    // The repo check before it gates it: a forbidden marker in a snapshot keeps the page down.
    assert.match(publish, /if: \$\{\{ !cancelled\(\) && steps\.precheck\.outcome == 'success' \}\}/);
    assert.ok(at("id: precheck") < at("scripts/publish-page.ts"));
  });
});
