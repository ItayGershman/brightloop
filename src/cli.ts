import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RunInput } from "./domain/types.ts";
import { inputWithError, parseCasesFile } from "./input/parse-cases-file.ts";
import { deliverSlackLine } from "./report/index.ts";
import { run } from "./run.ts";

// run --input cases.json --output result.json
// run --live --output result.json [--snapshots snapshots] [--headless]
// run --replay --output result.json [--snapshots snapshots]
// Bad input still produces a result.json with the problem in run.errors; only a wrong
// command line exits non-zero. Signal text, page text and config values are never logged.
// Every result carries its Slack line; it is posted only when SLACK_WEBHOOK_URL is set.

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
  if (!outputPath || [live, replay, Boolean(inputPath)].filter(Boolean).length !== 1) {
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

  const result = await deliverSlackLine(run(input), { env: process.env });
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error(`could not write ${outputPath}: --output must be a file path\n${USAGE}`);
    return 2;
  }
  console.log(
    `Wrote ${outputPath}: ${result.items.length} items, ${result.skipped.length} skipped, ${result.run.errors.length} errors.`,
  );
  console.log(`Slack line ${result.slack?.status}.`);
  return 0;
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
