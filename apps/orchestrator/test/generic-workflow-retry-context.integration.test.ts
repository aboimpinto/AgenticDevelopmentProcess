import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-workflow-retry-context.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const resolverSource = readFileSync(
  resolve(testRoot, "../src/workflows/recovery/previous-workflow-failure-brief-resolver.ts"),
  "utf8",
);
const gitSource = readFileSync(resolve(testRoot, "../src/infrastructure/git/safe-git-reader.ts"), "utf8");
const commandSource = readFileSync(resolve(testRoot, "../src/bootstrap/implementation-command-applications.ts"), "utf8");
const startImplementationSource = readFileSync(
  resolve(testRoot, "../src/application/features/start-implementation-application.ts"),
  "utf8",
);
const infrastructureSource = readFileSync(
  resolve(testRoot, "../src/bootstrap/workflow-infrastructure-applications.ts"),
  "utf8",
);

describe("generic workflow retry context", () => {
  it("binds four scenarios without fixed numeric work identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates failure resolution and context collection from composition", () => {
    expect(infrastructureSource).toContain("new PreviousWorkflowFailureBriefResolver");
    expect(commandSource).toContain("dependencies.previousFailureResolver.resolve(feature)");
    expect(rootSource).toContain("featureWorkflowContextCollector.collect(");
    expect(rootSource).not.toContain("function createPreviousWorkflowFailureBrief");
    expect(rootSource).not.toContain("function collectFeatureWorkflowContext");
  });

  it("delegates Git reads and keeps their failure contained", () => {
    expect(commandSource).toContain("readGit: (rootPath, args) => dependencies.safeGitReader.read(rootPath, args)");
    expect(startImplementationSource).toContain('|| "master"');
    expect(startImplementationSource).toContain('|| "unknown"');
    expect(rootSource).not.toContain("function safeGitOutput");
    expect(gitSource).toContain('execFileSync("git", args');
    expect(gitSource).toContain('return ""');
    expect(resolverSource).toContain("isSupersededByApproval");
  });
});
