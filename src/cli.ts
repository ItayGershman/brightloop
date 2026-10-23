import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { RunInput } from "./domain/types.ts";
import { inputWithError, parseCasesFile } from "./input/parse-cases-file.ts";
import { run } from "./run.ts";

// run --input cases.json --output result.json
// Bad input still produces a result.json with the problem in run.errors; only a wrong
// command line exits non-zero. Signal text and config values are never logged.

const USAGE = "usage: run --input <cases.json> --output <result.json>";

function main(argv: string[]): number {
  const args = argv[0] === "run" ? argv.slice(1) : argv;
  const inputPath = flag(args, "--input");
  const outputPath = flag(args, "--output");
  if (!inputPath || !outputPath) {
    console.error(USAGE);
    return 2;
  }

  let input: RunInput;
  try {
    input = parseCasesFile(readFileSync(inputPath, "utf8"));
  } catch {
    input = inputWithError("could not read the input file");
  }

  const result = run(input);
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
  return 0;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

process.exitCode = main(process.argv.slice(2));
