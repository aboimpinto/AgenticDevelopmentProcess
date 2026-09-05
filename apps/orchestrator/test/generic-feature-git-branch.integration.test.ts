import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prepareFeatureBranches } from "../src/feature-git-branch.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-git-branch.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const completionCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-completion-applications.ts", import.meta.url)),
  "utf8",
);
const runCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic feature Git branch Gherkin integration", () => {
  it("specifies repository and branch behavior without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds Start and Complete Feature composition to the branch adapter", () => {
    expect(prepareFeatureBranches).toBeTypeOf("function");
    expect(runCompositionSource).toContain("prepareFeatureBranches({");
    expect(completionCompositionSource).toContain("detectCurrentProjectBranch(project.rootPath)");
    expect(orchestratorSource).not.toContain("function createImplementationBranch");
    expect(orchestratorSource).not.toContain("function createImplementationBranchName");
  });
});
