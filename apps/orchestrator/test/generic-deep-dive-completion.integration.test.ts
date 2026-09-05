import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-deep-dive-completion.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const compositionSource = readFileSync(resolve(testRoot, "../src/bootstrap/deep-dive-applications.ts"), "utf8");
const applicationSource = readFileSync(
  resolve(testRoot, "../src/application/deep-dive/deep-dive-completion-application.ts"),
  "utf8",
);
const repositorySource = readFileSync(
  resolve(testRoot, "../src/application/deep-dive/deep-dive-source-document-repository.ts"),
  "utf8",
);

describe("generic Deep-Dive completion", () => {
  it("binds all scenarios without fixed numeric workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates completion and answers-ready handling to the application", () => {
    expect(rootSource).toContain("createDeepDiveApplications({");
    expect(compositionSource).toContain("new DeepDiveCompletionApplication");
    expect(rootSource).toContain("deepDiveCompletionApplication.complete(sessionId)");
    expect(compositionSource).toContain("deepDiveCompletionApplication.recordAnswersReady(session)");
    expect(rootSource).not.toContain("function completeDeepDiveSession");
    expect(rootSource).not.toContain("function recordDeepDiveAnswersReady");
  });

  it("preserves evidence-before-completion and failure recovery authority", () => {
    expect(applicationSource.indexOf("this.dependencies.metadataStore.recordHephaDeepDive")).toBeLessThan(
      applicationSource.indexOf("this.dependencies.metadataStore.recordFeatureWorkflowCompletion"),
    );
    expect(applicationSource).toContain('status: "failed"');
    expect(applicationSource).toContain("throw error");
    expect(repositorySource).toContain('createHash("sha256")');
    expect(repositorySource).toContain("normalizeDeepDiveSemanticSource");
  });
});
