import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-deep-dive-continuation-recovery.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const compositionSource = readFileSync(resolve(testRoot, "../src/bootstrap/deep-dive-applications.ts"), "utf8");
const commandSource = readFileSync(resolve(testRoot, "../src/bootstrap/implementation-command-applications.ts"), "utf8");
const applicationSource = readFileSync(
  resolve(testRoot, "../src/application/deep-dive/deep-dive-continuation-recovery-application.ts"),
  "utf8",
);

describe("generic Deep-Dive continuation recovery", () => {
  it("binds four scenarios without fixed numeric work identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates continuation recovery and removes the root implementation", () => {
    expect(rootSource).toContain("createDeepDiveApplications({");
    expect(compositionSource).toContain("new DeepDiveContinuationRecoveryApplication");
    expect(commandSource).toContain("dependencies.deepDiveRecovery.recover(project, feature)");
    expect(rootSource).not.toContain("function recoverStaleDeepDiveForContinuation");
  });

  it("keeps semantic classification and explicit recovery in the application boundary", () => {
    expect(applicationSource).toContain("assessDeepDiveRecovery");
    expect(applicationSource).toContain('assessment.classification === "lifecycle_only"');
    expect(applicationSource).toContain("confirmFeatureReadinessSource");
    expect(applicationSource).toContain("buildStaleDeepDiveRecoveryQuestion");
  });
});
