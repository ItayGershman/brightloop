import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";
import type { Result, RunInput } from "../src/domain/types.ts";
import { parseCasesFile } from "../src/input/parse-cases-file.ts";
import { run } from "../src/run.ts";
import { toCsv } from "../src/sheet/csv.ts";
import { runAndDeliver, sheetFromEnv, type SheetStore } from "../src/sheet/deliver.ts";
import { renderRows } from "../src/sheet/rows.ts";
import { COLUMNS } from "../src/sheet/tabs.ts";
import { briefExample, firstRunInput, pricingSignal, STARTED_AT } from "./helpers.ts";

// Maya's sheet: one row per item in her columns plus action, why and confidence. The renderer
// is pure; the Google adapter sits behind SheetStore, so no test here touches the network.

const MAYAS_COLUMNS = [
  "date",
  "competitor",
  "page",
  "what changed",
  "before",
  "after",
  "link to the page",
  "notes",
  "action",
  "why",
  "confidence",
];

function casesInput(...signals: Record<string, unknown>[]): RunInput {
  return parseCasesFile(JSON.stringify({ timezone: "Asia/Jerusalem", signals }));
}

function baselineResult(): Result {
  return run(firstRunInput(), { startedAt: STARTED_AT });
}

/** A Sheet held in memory, recording every call. */
function fakeSheet(tabs: { ownPricing?: string[][]; changes?: string[][] } = {}) {
  const changes = tabs.changes ?? [];
  const calls: string[] = [];
  const store: SheetStore = {
    async readOwnPricing() {
      calls.push("readOwnPricing");
      return tabs.ownPricing ?? [];
    },
    async readChanges() {
      calls.push("readChanges");
      return changes.map((row) => [...row]);
    },
    async appendChanges(rows) {
      calls.push("appendChanges");
      changes.push(...rows);
    },
  };
  return { store, changes, calls };
}

describe("rendering a result as rows", () => {
  test("the columns are Maya's, in her order, then action, why and confidence", () => {
    assert.deepEqual([...COLUMNS], MAYAS_COLUMNS);
  });

  test("one row per item, each cell in its column", () => {
    const result = run(casesInput(pricingSignal({ id: "np-1", competitor: "Bolt", source: "bolt.new/pricing", text: "Pro plan shown at $30/month (was $25 last week)." })), {
      startedAt: STARTED_AT,
    });
    const [item] = result.items;
    const rows = renderRows(result, "Asia/Jerusalem");
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], [
      "2026-10-26",
      "Bolt",
      "pricing page",
      "Pro plan shown at $30/month (was $25 last week).",
      "$25",
      "$30/month",
      "https://bolt.new/pricing",
      `${item.notes} Next: ${item.cta}`,
      "respond now",
      item.why,
      `${item.confidence_label} (${item.confidence})`,
    ]);
  });

  test("the date is the run's day in the given time zone", () => {
    const result = run(casesInput(pricingSignal({})), { startedAt: new Date("2026-10-25T22:30:00Z") });
    assert.equal(renderRows(result, "Asia/Jerusalem")[0][0], "2026-10-26");
    assert.equal(renderRows(result, "UTC")[0][0], "2026-10-25");
  });

  test("a baseline item is a row: no before, the plans in after", () => {
    const rows = renderRows(baselineResult(), "Asia/Jerusalem");
    assert.equal(rows.length, 3);
    const lovable = rows.find((row) => row[1] === "Lovable");
    assert.ok(lovable);
    assert.equal(lovable[4], "");
    assert.equal(lovable[5], "Free $0; Pro $25/month; Business $50/month; Enterprise Platform fee");
    assert.equal(lovable[8], "no action, baseline recorded");
  });

  test("skipped signals are not rows: only items reach the sheet", () => {
    const result = run(parseCasesFile(JSON.stringify(briefExample())), { startedAt: STARTED_AT });
    assert.ok(result.skipped.length > 0);
    assert.equal(renderRows(result, "Asia/Jerusalem").length, result.items.length);
  });
});

describe("the CSV", () => {
  test("starts with the header, one line per row, CRLF line ends", () => {
    assert.equal(toCsv(COLUMNS, [["a", "b"]]), `${MAYAS_COLUMNS.join(",")}\r\na,b\r\n`);
  });

  test("quotes a cell with a comma, a quote or a line break, and doubles its quotes", () => {
    assert.equal(toCsv(["h"], [["a, b"], ['say "hi"'], ["line 1\nline 2"], ["cr\rhere"], ["plain"]]), 'h\r\n"a, b"\r\n"say ""hi"""\r\n"line 1\nline 2"\r\n"cr\rhere"\r\nplain\r\n');
  });

  test("a cell a spreadsheet would read as a formula is written as text", () => {
    assert.equal(toCsv(["h"], [["=IMPORTXML(1)"], ["+1"], ["@x"], ["-2"]]), "h\r\n'=IMPORTXML(1)\r\n'+1\r\n'@x\r\n'-2\r\n");
  });
});

describe("keys", () => {
  test("with no keys there is no Sheet, and the adapter is never constructed", () => {
    let constructed = 0;
    const connect = () => {
      constructed += 1;
      return fakeSheet().store;
    };
    assert.equal(sheetFromEnv({}, connect), undefined);
    assert.equal(sheetFromEnv({ SHEET_ID: "x" }, connect), undefined);
    assert.equal(sheetFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{}", SHEET_ID: "" }, connect), undefined);
    assert.equal(constructed, 0);
  });

  test("with both keys the adapter is built from them", () => {
    const seen: unknown[] = [];
    const { store } = fakeSheet();
    const sheet = sheetFromEnv({ GOOGLE_SERVICE_ACCOUNT_JSON: "{}", SHEET_ID: "sheet-1" }, (keys) => {
      seen.push(keys);
      return store;
    });
    assert.equal(sheet, store);
    assert.deepEqual(seen, [{ credentials: "{}", sheetId: "sheet-1" }]);
  });
});

describe("a run delivered to the Sheet", () => {
  const realFetch = globalThis.fetch;
  let fetches = 0;
  beforeEach(() => {
    fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("no network in tests");
    }) as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const signal = pricingSignal({ id: "np-1", competitor: "Bolt", source: "bolt.new/pricing", text: "Pro plan shown at $30/month (was $25 last week)." });

  test("with no Sheet: the rows come back for the CSV, own pricing is not connected, no network call", async () => {
    const { result, rows, sheetFailed } = await runAndDeliver(casesInput(signal), { startedAt: STARTED_AT });
    assert.equal(rows.length, 1);
    assert.equal(sheetFailed, false);
    assert.match(result.items[0].brightloop_comparison, /own-pricing tab is not connected/);
    assert.equal(fetches, 0);
  });

  test("own pricing is read from the tab at run time and fills the comparison", async () => {
    const { store, changes } = fakeSheet({ ownPricing: [["tier", "monthly price (USD)"], ["Test Starter", "41.99"]] });
    const { result } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.match(result.items[0].brightloop_comparison, /^Cheaper than Brightloop Test Starter: /);
    assert.ok(!JSON.stringify([result, changes]).includes("41.99"));
  });

  test("an empty own-pricing tab: the comparison says it can't be made", async () => {
    const { store } = fakeSheet({ ownPricing: [["tier", "monthly price (USD)", "billing", "notes"]] });
    const { result } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.match(result.items[0].brightloop_comparison, /^Can't compare: Brightloop's own-pricing tab is empty/);
  });

  test("an own-pricing tab with an unusable row or no price column fails the run, like a Sheet that cannot be read", async () => {
    for (const ownPricing of [[["tier", "monthly price (USD)"], ["Test Starter", "soon"]], [["plan", "price"], ["Test", "5"]]]) {
      const { store, changes } = fakeSheet({ ownPricing });
      const { sheetFailed, result } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
      assert.equal(sheetFailed, true);
      assert.ok(result.run.errors.some((error) => error.startsWith("own-pricing tab")));
      assert.equal(changes.length, 2, "the rows are still appended");
    }
  });

  test("rows are appended under Maya's header; an empty changes tab gets the header first", async () => {
    const { store, changes } = fakeSheet();
    const { rows } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.deepEqual(changes, [MAYAS_COLUMNS, ...rows]);
  });

  test("a re-run in the same week skips the rows already written, and says so", async () => {
    const { store, changes } = fakeSheet({ changes: [MAYAS_COLUMNS] });
    await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    const again = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: new Date("2026-10-28T06:30:00Z") });
    assert.equal(changes.length, 2);
    assert.equal(again.appended, 0);
    assert.equal(again.alreadyInSheet, 1);
  });

  test("the same change in a later week is a new row", async () => {
    const { store, changes } = fakeSheet({ changes: [MAYAS_COLUMNS] });
    await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    await runAndDeliver(casesInput(signal), { sheet: store, startedAt: new Date("2026-11-02T06:30:00Z") });
    assert.equal(changes.length, 3);
  });

  test("a tab whose columns Maya reordered or added to: rows land under the right header, and a re-run still skips them", async () => {
    const header = ["competitor", "date", "my own column", ...MAYAS_COLUMNS.filter((name) => name !== "competitor" && name !== "date")];
    const { store, changes } = fakeSheet({ changes: [header] });
    const { rows } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.deepEqual(changes[1].slice(0, 4), [rows[0][1], rows[0][0], "", rows[0][2]]);
    const again = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.equal(again.alreadyInSheet, 1);
    assert.equal(changes.length, 2);
  });

  test("two identical rows in one run are written once", async () => {
    const { store, changes } = fakeSheet({ changes: [MAYAS_COLUMNS] });
    const twin = { ...signal, id: "np-2", source: "https://bolt.new/pricing", ts: "2026-10-23T09:00:00Z" };
    const delivered = await runAndDeliver(casesInput(signal, twin), { sheet: store, startedAt: STARTED_AT });
    assert.equal(delivered.rows.length, 2);
    assert.equal(changes.length, 2);
    assert.equal(delivered.alreadyInSheet, 1);
  });

  test("a Sheet that fails is a run error, with no detail from the failure, and the rows still come back", async () => {
    const { store } = fakeSheet();
    store.appendChanges = async () => {
      throw new Error("secret-ish detail");
    };
    store.readOwnPricing = async () => {
      throw new Error("secret-ish detail");
    };
    const { result, rows, sheetFailed } = await runAndDeliver(casesInput(signal), { sheet: store, startedAt: STARTED_AT });
    assert.equal(sheetFailed, true);
    assert.equal(rows.length, 1);
    assert.match(result.items[0].brightloop_comparison, /own-pricing tab could not be read/);
    assert.ok(result.run.errors.includes("could not read the own-pricing tab, so no comparison is made"));
    assert.ok(result.run.errors.includes("could not append the rows to the Sheet; they are in the CSV"));
    assert.ok(!JSON.stringify(result).includes("secret-ish"));
  });
});

describe("the CLI", () => {
  test("an --output ending in .csv prints the usage line: the CSV would overwrite it", () => {
    const output = join(mkdtempSync(join(tmpdir(), "brightloop-")), "result.csv");
    const cli = spawnSync("./run", ["--input", "cases/brief-example/input.json", "--output", output], { encoding: "utf8" });
    assert.equal(cli.status, 2);
    assert.match(cli.stderr, /^usage: run --input/);
  });

  test("writes the CSV next to result.json, with the same rows, and never needs a key", () => {
    const dir = mkdtempSync(join(tmpdir(), "brightloop-"));
    const output = join(dir, "result.json");
    const env = { ...process.env, GOOGLE_SERVICE_ACCOUNT_JSON: "", SHEET_ID: "" };
    const cli = spawnSync("./run", ["--input", "cases/brief-example/input.json", "--output", output], { encoding: "utf8", env });
    assert.equal(cli.status, 0, cli.stderr);
    const result: Result = JSON.parse(readFileSync(output, "utf8"));
    const csv = readFileSync(join(dir, "result.csv"), "utf8");
    assert.equal(csv, toCsv(COLUMNS, renderRows(result, "Asia/Jerusalem")));
    assert.match(cli.stdout, /Wrote .*result\.csv: \d+ rows/);
  });
});
