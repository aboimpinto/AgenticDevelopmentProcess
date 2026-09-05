import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImplementationRecoveryRetryApplication } from "../src/workflows/recovery/implementation-recovery-retry-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-recovery-retry.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/recovery/implementation-recovery-retry-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)), "utf8");

describe("generic implementation recovery retry Gherkin integration", () => {
  it("specifies retry outcomes without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns successful, nested-success, and final-failure projection", () => {
    expect(ImplementationRecoveryRetryApplication).toBeTypeOf("function");
    expect(source).toContain("attemptNestedRecovery");
    expect(source).toContain("nestedRecovery.errorMessage");
  });
  it("leaves root composition and delegation without the former function", () => {
    expect(composition).toContain("implementationRecoveryRetryApplication.execute(");
    expect(root).not.toContain("function runAutonomousImplementationRecoveryRetry");
  });
});
