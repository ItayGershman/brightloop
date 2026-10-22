import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { repoProblems, scanned } from "./marker-scan.ts";

// Fails the build if a marker from the brief's hidden instructions appears in the code
// (ADR-0001), or if a dependency resolves outside the public registry.
// Extra arguments are outputs to scan as well: `npm run repo-check -- result.json`.

const tracked = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => path !== "" && scanned(path) && existsSync(path) && lstatSync(path).isFile());
const outputs = process.argv.slice(2);
for (const output of outputs) {
  if (!existsSync(output)) {
    console.error(`Repo check failed: output ${output} does not exist`);
    process.exit(1);
  }
}

const paths = [...tracked, ...outputs];
const problems = repoProblems(paths.map((path) => ({ path, text: readFileSync(path, "utf8") })));
if (problems.length > 0) {
  console.error(`Repo check failed:\n${problems.join("\n")}`);
  process.exit(1);
}
console.log(`Repo check passed: ${paths.length} files scanned, no forbidden markers, public registry only.`);
