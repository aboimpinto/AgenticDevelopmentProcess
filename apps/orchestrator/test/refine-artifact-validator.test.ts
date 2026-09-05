import { describe, expect, it } from "vitest";
import {
  REQUIRED_QUALITY_GATE_ROWS,
  validateFeatureTasks,
  validatePhaseFile,
  validatePlanningArtifact,
  type ArtifactValidationError,
} from "../src/refine-artifact-validator.js";

function phase(number: number, title = "Completely arbitrary work") {
  return `# Phase ${number} — ${title}

**Status:** PENDING

## Objective

Prove the declared outcome.

## Phase Task Ledger

- [ ] Durable task.

## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Worker must update. |
| Tests | missing | Worker must update. |
| Gherkin/Playwright E2E | not applicable | No browser behavior. |
| Code review | missing | Worker must update. |
`;
}

describe("generic refinement artifact structure", () => {
  it("validates an arbitrary two-phase inventory instead of assuming nine feature phases", () => {
    const content = [
      "| Phase | Work | Status |",
      "| --- | --- | --- |",
      "| 0 | Frame the experiment | PENDING |",
      "| 1 | Record the R&D decision | PENDING |",
    ].join("\n");
    const errors: ArtifactValidationError[] = [];

    validateFeatureTasks(content, "FeatureTasks.md", errors, [0, 1]);

    expect(errors).toEqual([]);
  });

  it("reports an inventory phase that has no matching numeric-prefix document", () => {
    const content = [
      "| Phase | Work | Status |",
      "| --- | --- | --- |",
      "| 0 | Frame the experiment | PENDING |",
      "| 1 | Record the R&D decision | PENDING |",
    ].join("\n");
    const errors: ArtifactValidationError[] = [];

    validateFeatureTasks(content, "FeatureTasks.md", errors, [0]);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "INCOMPLETE_PHASE_COVERAGE",
        message: expect.stringContaining("no matching phase-1 document"),
      }),
    ]));
  });

  it("validates planning coverage against the declared phase numbers only", () => {
    const planning = `## Phase Implementation Index

| Phase | Planning sections | Implementation obligations | Acceptance evidence |
| --- | --- | --- | --- |
| 0 | Question | Investigate | Notes |
| 1 | Experiment | Prototype | Measurements |
| 2 | Decision | Record | Decision record |
`;
    const errors: ArtifactValidationError[] = [];

    validatePlanningArtifact(planning, "planning-analysis-report.md", errors, [0, 1, 2]);

    expect(errors).toEqual([]);
  });

  it("requires the filename and Markdown heading to share the same Phase number", () => {
    const errors: ArtifactValidationError[] = [];

    validatePhaseFile(phase(4), "Phases/phase-3-random-research-name.md", errors);

    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "CONTRACT_DOCUMENT_MISMATCH" }),
    ]));
  });

  it("accepts any suffix and title when the Phase number matches", () => {
    const errors: ArtifactValidationError[] = [];

    validatePhaseFile(phase(3, "Can this architecture survive load?"), "Phases/phase-3-xyz-anything-at-all.md", errors);

    expect(errors).toEqual([]);
  });

  it("retains the generic quality-gate contract", () => {
    expect(REQUIRED_QUALITY_GATE_ROWS).toEqual(
      expect.arrayContaining(["Changed files", "Tests", "Gherkin/Playwright E2E", "Code review"]),
    );
  });
});
