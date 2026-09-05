import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = import.meta.dirname;
const feature = readFileSync(resolve(testRoot, "generic-workflow-evidence-projection.feature"), "utf8");
const rootSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const boundarySource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-boundary-applications.ts"), "utf8");
const completionSource = readFileSync(resolve(testRoot, "../src/bootstrap/feature-completion-applications.ts"), "utf8");
const checkpointSource = readFileSync(
  resolve(testRoot, "../src/workflows/phases/phase-checkpoint-projection-repository.ts"),
  "utf8",
);
const summarySource = readFileSync(resolve(testRoot, "../src/workflows/workflow-output-summary.ts"), "utf8");
const implementationCoordinatorSource = [
  readFileSync(resolve(testRoot, "../src/workflows/implementation/start-implementation-run-application.ts"), "utf8"),
  readFileSync(resolve(testRoot, "../src/workflows/implementation/continue-implementation-run-application.ts"), "utf8"),
].join("\n");

describe("generic workflow evidence projection", () => {
  it("binds four scenarios without fixed numeric work identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(feature).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
  });

  it("delegates evidence concerns and removes their root implementations", () => {
    expect(rootSource).toContain("phaseCheckpointProjectionRepository,");
    expect(boundarySource).toContain("phaseCheckpointProjectionRepository.persist");
    expect(completionSource).toContain("getFeatureLessonsLearnedPath(project, currentFeature)");
    expect(implementationCoordinatorSource).toContain("summarizeOutput(output");
    expect(rootSource).not.toContain("function persistDeclaredVerificationProjection");
    expect(rootSource).not.toContain("function summarizeWorkflowOutput");
  });

  it("keeps projection non-authoritative and summary bounded", () => {
    expect(checkpointSource).toContain("if (!existsSync(phase.documentPath)) return");
    expect(checkpointSource).toContain("upsertPhaseCheckpointReport");
    expect(summarySource).toContain(".slice(0, 6)");
    expect(summarySource).toContain("truncate(cleaned, 600)");
  });
});
