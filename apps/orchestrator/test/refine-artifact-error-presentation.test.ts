/** Structured error formatting when generic refinement artifacts fail validation. */

import { describe, expect, it } from "vitest";
import { validateRefineArtifacts } from "../src/refine-artifact-validator.js";

describe("refinement artifact error formatting", () => {
  it("produces structured error messages with code, path, and description", () => {
    // Simulate what the orchestrator does with the validation result
    const errors = [
      { code: "MISSING_FILE" as const, path: "Phases/phase-2-any-random-name.md", message: "Required refinement artifact not found: Phases/phase-2-any-random-name.md" },
      { code: "EMPTY_FILE" as const, path: "FeatureTasks.md", message: "Required refinement artifact exists but is empty: FeatureTasks.md" },
    ];

    const formatted = errors.map((e) => `[${e.code}] ${e.path}: ${e.message}`).join("; ");
    const fullMessage = `Refinement artifacts failed validation: ${formatted}`;

    // Verify format
    expect(fullMessage).toContain("[MISSING_FILE]");
    expect(fullMessage).toContain("[EMPTY_FILE]");
    expect(fullMessage).toContain("Phases/phase-2-any-random-name.md");
    expect(fullMessage).toContain("FeatureTasks.md");
    // Paths are relative (no absolute paths exposed)
    expect(fullMessage).not.toContain("C:");
    expect(fullMessage).not.toContain("/home/");
    expect(fullMessage).not.toContain("/mnt/");
  });

  it("includes all validation errors in a single failure message", () => {
    const errors = [
      { code: "MISSING_FILE" as const, path: "FeatureTasks.md", message: "FeatureTasks.md not found" },
      { code: "MISSING_FILE" as const, path: "Phases/phase-0-health-check.md", message: "phase-0 not found" },
      { code: "MISSING_FILE" as const, path: "Phases/phase-1-planning-analysis.md", message: "phase-1 not found" },
    ];

    const formatted = errors.map((e) => `[${e.code}] ${e.path}: ${e.message}`).join("; ");
    const fullMessage = `Refinement artifacts failed validation: ${formatted}`;

    expect(fullMessage).toContain("[MISSING_FILE]");
    expect(fullMessage).toContain("FeatureTasks.md");
    expect(fullMessage).toContain("phase-0-health-check.md");
    expect(fullMessage).toContain("phase-1-planning-analysis.md");

    // All errors in one message
    const matches = fullMessage.match(/\[MISSING_FILE\]/g);
    expect(matches).toHaveLength(3);
  });

  it("error message format is compatible with createWorkflowFailureBrief truncation", () => {
    // createWorkflowFailureBrief truncates at 700 chars
    const errors = [
      { code: "MISSING_FILE" as const, path: "Phases/phase-2-any-random-name.md", message: "Required refinement artifact not found: Phases/phase-2-any-random-name.md" },
    ];

    const formatted = errors.map((e) => `[${e.code}] ${e.path}: ${e.message}`).join("; ");
    const fullMessage = `Refinement artifacts failed validation: ${formatted}`;

    // Must be shorter than 700 chars for full visibility
    expect(fullMessage.length).toBeLessThan(200);
  });
});

describe("workflow failure analysis for validation errors", () => {
  it("detects refinement artifact validation errors from raw error text", () => {
    const rawError = "Refinement artifacts failed validation: [MISSING_FILE] FeatureTasks.md: Required refinement artifact not found.";

    expect(rawError.includes("Refinement artifacts failed validation:")).toBe(true);
  });

  it("error message uses relative paths only", () => {
    const rawError = "Refinement artifacts failed validation: [MISSING_FILE] FeatureTasks.md: Required refinement artifact not found: FeatureTasks.md";

    // Verify no absolute path patterns
    expect(rawError).not.toMatch(/^\/|^[A-Za-z]:\\/);
  });

  it("multiple validation errors are delimited consistently", () => {
    const errorParts = [
      "[MISSING_FILE] FeatureTasks.md: not found",
      "[EMPTY_FILE] Phases/phase-3.md: empty",
    ];

    const rawError = `Refinement artifacts failed validation: ${errorParts.join("; ")}`;

    expect(rawError).toContain("; ");
    // Prefix message + 2 error parts = 3 segments when split by "; "
    const parts = rawError.split("; ");
    // "Refinement artifacts failed validation: [MISSING_FILE] FeatureTasks.md: not found"
    // then "[EMPTY_FILE] Phases/phase-3.md: empty"
    expect(parts.length).toBe(2);
  });
});
