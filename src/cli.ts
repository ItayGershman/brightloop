import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, format, parse } from "node:path";
import type { RunInput } from "./domain/types.ts";
import { inputWithError, parseCasesFile } from "./input/parse-cases-file.ts";
import { toCsv } from "./sheet/csv.ts";
import { runAndDeliver, sheetFromEnv } from "./sheet/deliver.ts";
import { COLUMNS } from "./sheet/tabs.ts";

// run --input cases.json --output result.json
// run --live --output result.json [--snapshots snapshots] [--headless]
// run --replay --output result.json [--snapshots snapshots]
// Bad input still produces a result.json with the problem in run.errors, and the same rows
// as Maya's sheet in a CSV beside it (result.csv). A live run with both keys in the
// environment (GOOGLE_SERVICE_ACCOUNT_JSON, SHEET_ID) also reads the own-pricing tab and
// appends the rows to the Sheet; a cases file or a replay never touches the Sheet. A wrong
// command line exits 2, a Sheet that failed exits 1. Signal text, page text, config values
// and keys are never logged.

const USAGE =
  "usage: run --input <cases.json> --output <result.json>\n" +
  "       run --live --output <result.json> [--snapshots <dir>] [--headless]\n" +
  "       run --replay --output <result.json> [--snapshots <dir>]";
const DEFAULT_SNAPSHOTS_DIR = "snapshots";

async function main(argv: string[]): Promise<number> {
  const args = argv[0] === "run" ? argv.slice(1) : argv;
  const live = args.includes("--live");
  const replay = args.includes("--replay");
  const inputPath = flag(args, "--input");
  const outputPath = flag(args, "--output");
  const snapshotsDir = flag(args, "--snapshots") ?? DEFAULT_SNAPSHOTS_DIR;
  // The CSV goes beside the result with a .csv extension, so the result itself cannot be one.
  if (!outputPath || parse(outputPath).ext.toLowerCase() === ".csv" || [live, replay, Boolean(inputPath)].filter(Boolean).length !== 1) {
    console.error(USAGE);
    return 2;
  }

  // The browser code is loaded only for a live run or a replay, so a cases-file run never touches it.
  const capture = live || replay ? await import("./capture/index.ts") : undefined;
  const input = capture
    ? live
      ? await capture.captureLiveInput({ snapshotsDir, headless: args.includes("--headless") })
      : capture.replayInput(snapshotsDir)
    : readCasesFile(inputPath ?? "");

  const sheet = live ? sheetFromEnv(process.env) : undefined;
  const { result, rows, appended, alreadyInSheet, sheetFailed } = await runAndDeliver(input, { sheet });
  const csvPath = format({ ...parse(outputPath), base: undefined, ext: ".csv" });
  if (!write(outputPath, `${JSON.stringify(result, null, 2)}\n`) || !write(csvPath, toCsv(COLUMNS, rows))) return 2;
  console.log(
    `Wrote ${outputPath}: ${result.items.length} items, ${result.skipped.length} skipped, ${result.run.errors.length} errors.`,
  );
  console.log(`Wrote ${csvPath}: ${rows.length} rows.`);
  if (live) {
    console.log(
      sheet
        ? `Sheet: ${sheetFailed ? "failed, see run.errors; " : ""}${appended} rows appended, ${alreadyInSheet} already there.`
        : "Sheet: no keys, so the rows are in the CSV only.",
    );
  }
  return sheetFailed ? 1 : 0;
}

/** Writes a file, or prints why it could not and the usage line. */
function write(path: string, text: string): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
    return true;
  } catch {
    console.error(`could not write ${path}: --output must be a file path\n${USAGE}`);
    return false;
  }
}

function readCasesFile(path: string): RunInput {
  try {
    return parseCasesFile(readFileSync(path, "utf8"));
  } catch {
    return inputWithError("could not read the input file");
  }
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

process.exitCode = await main(process.argv.slice(2));
