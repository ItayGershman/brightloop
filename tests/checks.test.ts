import assert from "node:assert/strict";
import { describe, test } from "node:test";
import isEqual from "lodash/isEqual.js";
import * as checks from "../src/checks.ts";

// The in-run checks are a deep module: three checks out, every part inside.

describe("the in-run checks module", () => {
  test("exposes only the item check, the result check and the forbidden-value check", () => {
    const exported = Object.keys(checks).sort();
    assert.ok(isEqual(exported, ["checkItem", "checkResult", "forbiddenValues"]), `exports: ${exported.join(", ")}`);
  });
});
