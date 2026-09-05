import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, "../../web/src");
const boardValidation = readFileSync(resolve(webRoot, "boards/board-validation.tsx"), "utf8");
const presentation = readFileSync(resolve(webRoot, "workflow/workflow-presentation.ts"), "utf8");
const phaseTelemetry = readFileSync(resolve(webRoot, "workflow/phase-execution-telemetry.ts"), "utf8");

describe("workflow history display", () => {
  it("suppresses superseded workflow failures in the extracted validation module", () => {
    expect(boardValidation).toContain("function isSupersededImplementationFailure");
    expect(boardValidation).toContain("function isSupersededWorkflowFailure");
    expect(boardValidation).toContain('item.stateFolder === "04_COMPLETED" && lastRun.command !== "complete-feature"');
    expect(boardValidation).toContain("function getSupersededWorkflowRecoveryOutcome");
    expect(boardValidation).toContain("No required refinement artifacts are missing.");
    expect(boardValidation).toContain("timeout recovered");
  });

  it("projects workflow activity from persisted run data", () => {
    expect(presentation).toContain("activeRun?.workflowProgress?.steps ?? []");
    expect(presentation).toContain("selectLatestPhaseRun(implementationPhases, phase.number)");
    expect(presentation).toContain("buildPhaseExecutionTelemetry(");
    expect(phaseTelemetry).toContain("phaseActualDurationMs(implementationPhases, agentRuns, phase.number)");
    expect(phaseTelemetry).toContain("splitMcpRunAcrossPhases(run, phases)");
  });

  it("counts missing quality gates only for resolved phases", () => {
    expect(boardValidation).toContain("function countMissingQualityGates");
    expect(boardValidation).toContain("function isResolvedPhaseQualitySummary");
    expect(boardValidation).toContain('normalizedStatus === "COMPLETED"');
    expect(boardValidation).toContain('normalizedStatus === "SKIPPED"');
  });
});
