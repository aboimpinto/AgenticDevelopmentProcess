import { describe, expect, it } from "vitest";
import { parseRefineFeatureWorkerResult } from "../src/application/features/refine-feature-worker-result.js";

const files = [
  "FeatureTasks.md",
  "planning-analysis-report.md",
  "PhaseExecutionContract.json",
  "ArchitectureDebtTouchPlan.json",
  "Phases/phase-0-arbitrary-name.md",
];

describe("Refine Feature worker result V1", () => {
  it("accepts a completed outcome with generic phase-prefixed artifact paths", () => {
    expect(parseRefineFeatureWorkerResult(JSON.stringify({ outcome: "COMPLETED", summary: "Ready", files })))
      .toEqual({ kind: "completed", summary: "Ready", files });
  });

  it("normalizes a needs-Deep-Dive outcome into interactive questions with chat enabled", () => {
    const result = parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "A user-owned choice remains.",
      questions: [{
        topic: "Ownership",
        prompt: "Choose the owner.",
        recommendedOptionLabel: "Owner A",
        options: [
          { label: "Owner A", description: "A owns it." },
          { label: "Owner B", description: "B owns it." },
          { label: "Defer", description: "Defer the capability." },
        ],
      }],
    }));
    expect(result).toMatchObject({
      kind: "needs_deep_dive",
      reason: "A user-owned choice remains.",
      questions: [{ chatMessages: [], recommendedOptionId: "option-1-owner-a", status: "pending" }],
    });
  });

  it("rejects prose, incomplete success receipts, and malformed questions as operational errors", () => {
    expect(() => parseRefineFeatureWorkerResult("Refinement is blocked.")).toThrow(/REFINE_FEATURE_RESULT_V1_INVALID/);
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({ outcome: "COMPLETED", summary: "Ready", files: ["FeatureTasks.md"] }))).toThrow(/must name FeatureTasks/);
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "Choice",
      questions: [{ topic: "X", prompt: "Y", recommendedOptionLabel: "A", options: [] }],
    }))).toThrow(/three or four options/);
  });

  it("enforces the exact V1 shape instead of silently normalizing schema violations", () => {
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "COMPLETED", summary: "Ready", files: [...files, files[0]], extra: true,
    }))).toThrow(/exactly outcome, summary, files/);
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "COMPLETED", summary: "Ready", files: [...files, "notes.md"],
    }))).toThrow(/unsupported artifact path/);
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "Choice",
      questions: [{
        topic: "Boundary",
        prompt: "Choose.",
        recommendedOptionLabel: "Missing",
        options: [
          { label: "A", description: "A" },
          { label: "B", description: "B" },
          { label: "C", description: "C" },
        ],
      }],
    }))).toThrow(/must match an option label/);
    expect(() => parseRefineFeatureWorkerResult(JSON.stringify({
      outcome: "NEEDS_DEEP_DIVE",
      reason: "Choice",
      questions: [{
        topic: "Boundary",
        prompt: "Choose.",
        recommendedOptionLabel: "A",
        options: [
          { label: "A", description: "A" },
          { label: "B", description: "B" },
          { label: "C", description: "C" },
          { label: "D", description: "D" },
          { label: "E", description: "E" },
        ],
      }],
    }))).toThrow(/three or four options/);
  });
});
