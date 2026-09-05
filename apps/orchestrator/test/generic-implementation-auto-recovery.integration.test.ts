import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ImplementationAutoRecoveryApplication } from "../src/workflows/recovery/implementation-auto-recovery-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-implementation-auto-recovery.feature", import.meta.url)), "utf8");
const source = readFileSync(fileURLToPath(new URL("../src/workflows/recovery/implementation-auto-recovery-application.ts", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const runComposition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");
const recoveryComposition = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)), "utf8");

describe("generic implementation automatic recovery Gherkin integration", () => {
  it("specifies recovery routes without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(9);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("owns fatal, fixer, host, analysis, guard, and retry decisions", () => {
    expect(feature).toContain("Scenario: No recovery worker is dispatched for a phase whose derived state is COMPLETED");
    expect(ImplementationAutoRecoveryApplication).toBeTypeOf("function");
    for (const seam of ["isFatalFailure", "isReviewFindingResolutionFailure", "skipRecoveryAgent", "parseRecoveryResult", "Host Recovery Guard", "retryWithBrief", "isRecoveryPhaseDerivedCompleted"]) expect(source).toContain(seam);
  });
  it("routes provider prompt refusal to one fresh-session retry", () => {
    expect(source).toContain("isProviderPromptRefusalFailure");
    expect(source).toContain("Retry provider-refused task in a fresh session");
    expect(source).toContain("recoveryAttempt: input.recoveryAttempt + 1");
    expect(recoveryComposition).toContain("isProviderPromptRefusalFailure,");
  });
  it("leaves composition in the recovery and run factories", () => {
    expect(root).toContain("autoRecovery: implementationAutoRecoveryApplication");
    expect(runComposition).toContain("dependencies.autoRecovery.attempt(input)");
    expect(root).not.toContain("function attemptImplementationAutoRecovery");
  });
});
