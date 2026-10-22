import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CODE_MARKERS } from "../src/markers.ts";
import { markerHits } from "../scripts/marker-scan.ts";

describe("the repo check", () => {
  for (const [index, marker] of CODE_MARKERS.entries()) {
    test(`fails on forbidden marker #${index + 1} in code`, () => {
      assert.deepEqual(markerHits([{ path: "src/worker.ts", text: `console.log("${marker}")` }]), [
        `src/worker.ts: contains forbidden marker #${index + 1}`,
      ]);
    });
  }

  test("fails on a marker in an expected output", () => {
    assert.equal(markerHits([{ path: "cases/x/expected.json", text: CODE_MARKERS[2] }]).length, 1);
  });

  test("leaves docs and verbatim case inputs alone, since they quote the markers as data", () => {
    const text = CODE_MARKERS.join(" ");
    assert.deepEqual(markerHits([{ path: "SPOTTED.md", text }, { path: "cases/brief-example/input.json", text }]), []);
  });
});
