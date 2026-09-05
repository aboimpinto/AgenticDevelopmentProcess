import { describe, expect, it, vi } from "vitest";
import {
  appendHostSideRecoveryToFailureBrief,
  appendRecoveryAnalysisToFailureBrief,
  getWorkflowFailureAnalysis,
  renderCodeReviewBlockerSection,
  WorkflowFailureBriefPresenter,
} from "../src/workflows/recovery/workflow-failure-brief-presenter.js";

function createPresenter(context: Parameters<typeof renderCodeReviewBlockerSection>[0] | null = null) {
  return new WorkflowFailureBriefPresenter({
    findCodeReviewContext: vi.fn(() => context),
    summarizeWorkflowOutput: vi.fn((_output, fallback) => `summary or ${fallback}`),
  });
}

describe("workflow failure brief presenter", () => {
  it("renders stable workflow identity and recovery analysis for a generic failure", () => {
    const brief = createPresenter().create({
      command: "continue-implementing",
      currentStep: "Implementing Phase 83",
      feature: { externalId: "ITEM-X" } as never,
      rawError: "ordinary worker failure",
      runId: "run-any",
    });

    expect(brief).toContain("## Previous Workflow Failure Brief");
    expect(brief).toContain("- Feature: ITEM-X");
    expect(brief).toContain("- Failed command: Continue Implementing");
    expect(brief).toContain("- Failed step: Implementing Phase 83");
    expect(brief).toContain("needs targeted recovery");
  });

  it("adds the complete review decision queue when review context is available", () => {
    const brief = createPresenter({
      excerpt: "review excerpt",
      findings: [{
        decisionRequirement: "record a complete fixer proposal",
        id: "finding-any",
        location: "src/module.ts",
        requiredChange: "apply the correction",
        severity: "required",
        summary: "correct the contract",
        type: "contract",
      }],
      phaseNumber: 83,
      reportPath: "/repo/reviews/latest.md",
      reviewResult: "NEEDS_CHANGES",
    }).create({
      command: "continue-implementing",
      feature: { externalId: "ITEM-X" } as never,
      rawError: "Phase 83 code review blocked autonomous implementation",
      runId: "run-review",
    });

    expect(brief).toContain("## Code Review Blocker");
    expect(brief).toContain("Review Finding Decision Queue");
    expect(brief).toContain("finding-any");
    expect(brief).toContain("/repo/reviews/latest.md");
  });

  it("compacts persisted summaries and delegates ordinary output summarization", () => {
    const presenter = createPresenter();
    const brief = presenter.compact({
      command: "start-implementing",
      currentStep: null,
      runId: "run-old",
    } as never, { externalId: "ITEM-Y" } as never, "a long persisted summary");

    expect(brief).toContain("Full retry history remains in workflow logs");
    expect(brief).toContain("- Failed step: Unknown");
    expect(brief).toContain("summary or The latest workflow attempt failed.");
  });

  it("replaces transient recovery sections instead of growing retry history", () => {
    const initial = appendRecoveryAnalysisToFailureBrief("## Previous Workflow Failure Brief\n\nbase", "```markdown\nfirst\n```");
    const replaced = appendHostSideRecoveryToFailureBrief(initial, "second");

    expect(replaced).toContain("## Host-Side Recovery\n\nsecond");
    expect(replaced).not.toContain("first");
    expect(replaced.match(/## Previous Workflow Failure Brief/g)).toHaveLength(1);
  });

  it.each([
    ["Code Review Agent failed", "failed before producing a review verdict"],
    ["HEPHA blocked unsafe Cargo execution", "command safety constraint"],
    ["cargo: command not found", "could not execute Cargo validation"],
    ["pnpm: command not found", "required local tool"],
    ["401 authentication failed", "model call failed"],
    ["Implementation Agent failed using plan-bound runtime. RUNTIME_INVALID_CONTEXT", "host runtime context was invalid"],
    ["Phase 0 cannot become COMPLETED while a declared task remains unresolved.", "host phase-exit guard reported unresolved work"],
    ["WORKFLOW_AWAITING_USER_DECISION: Phase 8 returned to pre_review", "paused for a user decision"],
    ["worker timed out after 20m", "configured runtime circuit"],
    ["Refine Feature Pi run stalled after 900 seconds", "Refinement stalled"],
    ["Phase 83 code review blocked autonomous implementation", "NEEDS_CHANGES/BLOCKED"],
    ["REFINE_FEATURE_RESULT_V1_INVALID: unsupported path", "result envelope was invalid"],
    ["Refinement artifacts failed validation: [MISSING_FILE]", "failed structural validation"],
    ["ordinary worker error", "needs targeted recovery"],
  ])("explains failure category %s", (error, expectedSummary) => {
    expect(getWorkflowFailureAnalysis(error).summary).toContain(expectedSummary);
  });

  it("explains no-progress termination as a preserved-state host failure", () => {
    const analysis = getWorkflowFailureAnalysis(
      "WORKFLOW_AWAITING_USER_DECISION: Phase 8 returned to the pre_review transition.",
    );

    expect(analysis.likelyCause).toContain("authoritative FEAT, task, review, and checkpoint evidence");
    expect(analysis.retryInstruction).toContain("let the user choose");
    expect(analysis.suggestedRecovery).toContain("blocked and waiting for an explicit user decision");
  });

  it("keeps exhausted-task phase-exit recovery out of the implementation worker", () => {
    const analysis = getWorkflowFailureAnalysis(
      "Phase 0 cannot become COMPLETED while a declared task remains unresolved.",
    );

    expect(analysis.likelyCause).toContain("host ledger-reconciliation defect");
    expect(analysis.retryInstruction).toContain("resume at phase exit or the declared git checkpoint");
    expect(analysis.suggestedRecovery).toContain("Do not treat checkpoint sign-offs");
  });

  it("uses artifact recovery rather than implementation-task prose for refinement stalls", () => {
    const analysis = getWorkflowFailureAnalysis("Refine Feature Pi run stalled after 900 seconds");

    expect(analysis.retryInstruction).toContain("first missing or invalid artifact");
    expect(analysis.retryInstruction).not.toContain("phase task");
  });

  it("keeps credential recovery within the configured policy connection", () => {
    const analysis = getWorkflowFailureAnalysis("401 authentication failed");

    expect(analysis.likelyCause).toContain("routing connection");
    expect(analysis.suggestedRecovery).toContain("supported provider management");
    expect(analysis.suggestedRecovery).toContain("Do not use an environment model default or substitute route.");
    expect(analysis.suggestedRecovery).not.toMatch(/DEEPSEEK_API_KEY|OPENAI_API_KEY|openai-codex/i);
  });
});
