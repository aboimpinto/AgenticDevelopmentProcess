import { describe, expect, it } from "vitest";
import {
  extractPhaseNumber,
  extractPhaseRouting,
  extractPhaseStatus,
  extractPhaseTitle,
  isKnownWorkflowStatus,
  isStandalonePhaseStatusLine,
  normalizeWorkflowStatusLabel,
} from "../src/memorybank/phase-document-parser.js";

describe("phase document parser", () => {
  it("uses the numeric filename prefix as the canonical order", () => {
    expect(extractPhaseNumber("phase-12-random-name.md", "# Phase 99 Other")).toBe(12);
    expect(extractPhaseNumber("random.md", "# Phase 7 Any title")).toBe(7);
    expect(extractPhaseNumber("random.md", "# Documentation only")).toBeNull();
  });

  it("reads arbitrary phase titles and declared routing fields", () => {
    const markdown = [
      "# Phase 4 — An Entirely Random Responsibility",
      "**Recommended Agent**: implementation-agent",
      "**Recommended Model**: model-x",
      "**Estimated Human Time**: 5h",
      "**Estimated AI Time**: 45m",
    ].join("\n");

    expect(extractPhaseTitle("phase-4-anything.md", markdown)).toBe("An Entirely Random Responsibility");
    expect(extractPhaseRouting(markdown)).toEqual({
      estimatedAiTime: "45m",
      estimatedHumanTime: "5h",
      recommendedAgent: "implementation-agent",
      recommendedModel: "model-x",
    });
  });

  it("reads DevCycle Man/Hour and AI/Hour estimate fields symmetrically", () => {
    const markdown = [
      "# Phase 2: Data Contracts",
      "**Estimated Time (Man/Hour)**: 10h",
      "**Estimated Time (AI/Hour)**: 6h",
    ].join("\n");

    expect(extractPhaseRouting(markdown)).toEqual({
      estimatedAiTime: "6h",
      estimatedHumanTime: "10h",
      recommendedAgent: null,
      recommendedModel: null,
    });
  });

  it("prefers explicit status and only infers completion from resolved tasks and gates", () => {
    expect(extractPhaseStatus("**Status:** IN_PROGRESS")).toBe("IN_PROGRESS");
    const resolved = [
      "## Hepha Task State",
      "| ID | Task | State |",
      "| --- | --- | --- |",
      "| t1 | Write docs | COMPLETED |",
      "## Quality Gate Evidence",
      "| Gate | Decision |",
      "| --- | --- |",
      "| tests | NOT_APPLICABLE |",
    ].join("\n");
    expect(extractPhaseStatus(resolved)).toBe("COMPLETED");
    expect(extractPhaseStatus(resolved.replace("NOT_APPLICABLE", "PENDING"))).toBeNull();
  });

  it("normalizes workflow status aliases without using a phase name", () => {
    expect(normalizeWorkflowStatusLabel("not started")).toBe("PENDING");
    expect(normalizeWorkflowStatusLabel("code-review in progress")).toBe("CODE_REVIEW_IN_PROGRESS");
    expect(normalizeWorkflowStatusLabel("failed")).toBe("BLOCKED");
  });

  it("recognizes only standalone status fields and known workflow values", () => {
    expect(isStandalonePhaseStatusLine("**Status:** AWAITING_REVIEW")).toBe(true);
    expect(isStandalonePhaseStatusLine("| Status | PENDING |")).toBe(false);
    expect(isKnownWorkflowStatus("RECOVERY_COMPLETE")).toBe(true);
    expect(isKnownWorkflowStatus("descriptive prose")).toBe(false);
  });
});
