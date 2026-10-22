import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { run } from "./run.ts";
import { fileSource } from "./source.ts";
import type { Source } from "./types.ts";

// run --input cases.json --output result.json
// Bad input still produces a result.json with the problem in run.errors; only a wrong
// command line exits non-zero. Signal text and config values are never logged.

const USAGE = "usage: run --input <cases.json> --output <result.json>";

function main(argv: string[]): number {
  const args = argv[0] === "run" ? argv.slice(1) : argv;
  const input = flag(args, "--input");
  const output = flag(args, "--output");
  if (!input || !output) {
    console.error(USAGE);
    return 2;
  }

  let source: Source;
  try {
    source = fileSource(readFileSync(input, "utf8"));
  } catch {
    source = { signals: [], bannedWords: [], secrets: [], errors: ["could not read the input file"] };
  }

  const result = run(source);
  try {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  } catch {
    console.error(`could not write ${output}: --output must be a file path\n${USAGE}`);
    return 2;
  }
  console.log(
    `Wrote ${output}: ${result.items.length} items, ${result.skipped.length} skipped, ${result.run.errors.length} errors.`,
  );
  return 0;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}

process.exitCode = main(process.argv.slice(2));
