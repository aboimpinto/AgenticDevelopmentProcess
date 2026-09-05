import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isRecoverableImplementationFailure } from "../src/workflows/recovery/implementation-failure-classifier.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-failure-classification.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const recoveryCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)), "utf8");

describe("generic implementation failure classification Gherkin integration", () => {
  it("specifies recovery categories and phase extraction without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds autonomous recovery to the extracted classifier", () => {
    expect(isRecoverableImplementationFailure("worker timed out after 30m")).toBe(true);
    expect(isRecoverableImplementationFailure(
      "Invalid prompt: your prompt was flagged as potentially violating our usage policy.",
    )).toBe(true);
    expect(recoveryCompositionSource).toContain('from "../workflows/recovery/implementation-failure-classifier.js"');
    expect(orchestratorSource).not.toContain("function isRecoverableImplementationFailure");
  });
});
