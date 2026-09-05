import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { FocusedGitCommitAdapter } from "../src/infrastructure/git/focused-git-commit-adapter.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-focused-git-checkpoint.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const reviewCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-review-applications.ts", import.meta.url)),
  "utf8",
);
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic focused Git checkpoint Gherkin integration", () => {
  it("specifies focused, unchanged, and invalid-path behavior without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds phase review publication to the extracted Git adapter", () => {
    const adapter = new FocusedGitCommitAdapter({
      canonicalize: (path) => path,
      exists: () => true,
      isDirectory: () => false,
      isFile: () => true,
      run: vi.fn(() => ""),
      tryRun: vi.fn(() => "/repo"),
    });

    expect(adapter.commit({ commitMessage: "checkpoint", failureContext: "artifact", paths: [], successMessage: "done" })).toBeNull();
    expect(infrastructureSource).toContain("new FocusedGitCommitAdapter");
    expect(orchestratorSource).toContain("focusedGit: focusedGitCommitAdapter");
    expect(reviewCompositionSource).toContain("dependencies.focusedGit.commitReviewReport");
    expect(orchestratorSource).not.toContain("function commitFocusedGitPaths");
  });
});
