import { describe, expect, it } from "vitest";

import { containsActionableWarning } from "../src/final-verification-adapter.js";

describe("final verification warning policy", () => {
  it.each([
    "WARNING: deprecated API",
    "WARN dependency mismatch",
    "⚠ Compiled with warnings",
    "Compiled with warning",
  ])("detects actionable compilation output: %s", (output) => {
    expect(containsActionableWarning(output)).toBe(true);
  });

  it.each([
    "0 warnings",
    "No warnings or errors",
    "Build completed successfully",
    "Tests mention the word warning in a sentence",
  ])("does not mistake clean summaries or prose for emitted warnings: %s", (output) => {
    expect(containsActionableWarning(output)).toBe(false);
  });
});
