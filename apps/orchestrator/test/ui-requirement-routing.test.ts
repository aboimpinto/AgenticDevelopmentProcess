import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const orchestratorSource = [
  readFileSync(resolve(testDir, "../src/index.ts"), "utf8"),
  readFileSync(resolve(testDir, "../src/bootstrap/feature-projection-applications.ts"), "utf8"),
  readFileSync(resolve(testDir, "../src/application/features/feature-workflow-summary-projector.ts"), "utf8"),
  readFileSync(resolve(testDir, "../src/workflows/prompts/feature-entry-prompts.ts"), "utf8"),
].join("\n");

describe("UI requirement routing prompt", () => {
  it("has a deterministic no-ui guard for command-boundary maintenance work", () => {
    expect(orchestratorSource).toContain("classifyNoUiMaintenanceFeature");
    expect(orchestratorSource).toContain("command-boundary, parser/registry, completion/palette metadata");
    expect(orchestratorSource).toContain("does not explicitly change visual UI requirements");
  });

  it("classifies slash-command and command metadata refactors as no-ui work", () => {
    expect(orchestratorSource).toContain("TUI command routing");
    expect(orchestratorSource).toContain("slash command behavior");
    expect(orchestratorSource).toContain("command palette metadata");
    expect(orchestratorSource).toContain("completion metadata");
    expect(orchestratorSource).toContain("CLI/TUI command refactors");
  });

  it("versions cached UI requirement decisions when routing rules change", () => {
    expect(orchestratorSource).toContain("ui-requirement-v2-command-refactor-no-ui");
    expect(orchestratorSource).toContain("createUiRequirementSourceHash,");
  });
});
