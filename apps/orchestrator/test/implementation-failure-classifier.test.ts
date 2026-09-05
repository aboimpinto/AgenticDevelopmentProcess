import { describe, expect, it } from "vitest";
import {
  extractCodeReviewBlockedPhaseNumber,
  extractGenericWorkflowFailedPhaseNumber,
  extractWorkflowFailurePhaseNumber,
  isAuthoritativeV1ReviewFailure,
  isCodeReviewAgentFailure,
  isCodeReviewBlockedFailure,
  isFixerResponseRepairCapFailure,
  isIncompleteFixerResponseFailure,
  isMissingLocalToolingFailure,
  isMissingPiCliFailure,
  isRecoverableImplementationFailure,
  isReviewContractPredecessorRequiredFailure,
  isReviewFindingResolutionFailure,
  isUnsafeCargoExecutionFailure,
} from "../src/workflows/recovery/implementation-failure-classifier.js";

describe("implementation failure classifier", () => {
  it.each([
    "Worker returned without completing the phase document",
    "Code Review Agent failed to return a verdict",
    "## Code Review Blocker\n- Phase: Phase 14",
    "Cannot request a code-review rerun until Fixer Response entries are complete",
    "HEPHA blocked unsafe Cargo execution",
    "pnpm: command not found",
    "Validation blocker remains",
    "Phase 21 is blocked by evidence",
    "Worker timed out after 20m",
    "Codex error: Invalid prompt: your prompt was flagged as potentially violating our usage policy. Please try again with a different prompt.",
  ])("classifies a recoverable failure: %s", (message) => {
    expect(isRecoverableImplementationFailure(message)).toBe(true);
  });

  it("distinguishes authoritative review and fixer contract failures", () => {
    expect(isAuthoritativeV1ReviewFailure("REVIEW_CONTRACT_V1_GATE_DENIED: missing evidence")).toBe(true);
    expect(isReviewContractPredecessorRequiredFailure("REVIEW_CONTRACT_PREDECESSOR_REQUIRED: rerun")).toBe(true);
    expect(isIncompleteFixerResponseFailure("cannot request a code-review rerun until fixer response entries are complete")).toBe(true);
    expect(isFixerResponseRepairCapFailure("Fixer Response repair cap reached")).toBe(true);
  });

  it("recognizes code-review worker, blocker, and finding-resolution failures", () => {
    expect(isCodeReviewAgentFailure("This failure came from the code-review model")).toBe(true);
    expect(isCodeReviewBlockedFailure("Phase 31 code review blocked autonomous implementation")).toBe(true);
    expect(isReviewFindingResolutionFailure({
      featureWorkflow: { lastRun: { currentStep: "Resolve Code Review Findings Phase 31 failed" } },
    } as never, "worker failed")).toBe(true);
  });

  it("recognizes unsafe command and missing local tooling variants", () => {
    expect(isUnsafeCargoExecutionFailure("more than one cargo command was requested")).toBe(true);
    expect(isMissingPiCliFailure("spawn pi enoent")).toBe(true);
    expect(isMissingLocalToolingFailure("cannot find module in node_modules")).toBe(true);
    expect(isMissingLocalToolingFailure("an ordinary assertion failed")).toBe(false);
  });

  it.each([
    ["- Failed step: Phase 42 failed", 42],
    ["Current phase: Phase 17", 17],
    ["Phase 9 cannot request a code-review rerun", 9],
  ])("extracts a generic failed phase from %s", (text, expected) => {
    expect(extractGenericWorkflowFailedPhaseNumber(text)).toBe(expected);
  });

  it("prefers the code-review blocker phase and returns null without phase evidence", () => {
    const text = "Phase 23 code review blocked autonomous implementation; Phase 99 failed";
    expect(extractCodeReviewBlockedPhaseNumber(text)).toBe(23);
    expect(extractWorkflowFailurePhaseNumber(text)).toBe(23);
    expect(extractWorkflowFailurePhaseNumber("no phase identity")).toBeNull();
  });
});
