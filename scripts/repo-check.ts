import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { markerHits, scanned } from "./marker-scan.ts";

// Fails the build if a marker from the brief's hidden instructions appears in the code (ADR-0001).

const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
  .split("\n")
  .filter((path) => path !== "" && scanned(path) && existsSync(path));

const hits = markerHits(paths.map((path) => ({ path, text: readFileSync(path, "utf8") })));
if (hits.length > 0) {
  console.error(`Repo check failed:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`Repo check passed: ${paths.length} files scanned, no forbidden markers.`);
