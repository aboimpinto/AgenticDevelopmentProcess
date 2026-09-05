import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { AuthoritativeReviewIntegrationResult } from "../src/authoritative-review-integration.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewPublicationApplication } from "../src/workflows/reviews/phase-review-publication-application.js";
import type { ReviewOutputEnforcementResult } from "../src/workflows/reviews/review-output-enforcement.js";

const scope = {
  featureId: "arbitrary-feature",
  phaseNumber: 731,
  projectId: "arbitrary-project",
  reviewGateId: "code-review" as const,
};

function integration(
  result: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED",
  gateState: "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING" =
    result === "APPROVED" ? "APPROVED" : result === "BLOCKED" ? "BLOCKED" : "REJECTED",
): AuthoritativeReviewIntegrationResult {
  return {
    kind: "persisted",
    ingestion: {
      contentHash: "a".repeat(64),
      gate: { gateState },
    },
    rendered: { markdown: `# Review\n\nResult: ${result}` },
  } as AuthoritativeReviewIntegrationResult;
}

function fixture(
  result: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED" = "APPROVED",
  gateState?: "APPROVED" | "REJECTED" | "BLOCKED" | "PENDING",
) {
  const phase = {
    documentPath: "/project/feature/phase.md", fileName: "phase.md", number: 731,
    status: "AWAITING_REVIEW", title: "Any Name",
  } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderPath: "/project/feature" } as WorkItemCard;
  const project = { id: scope.projectId, rootPath: "/project" } as StoredProject;
  const commitReport = vi.fn();
  const persistFindings = vi.fn(async () => undefined);
  const recordApprovedEvidence = vi.fn();
  const recordProgress = vi.fn(async () => undefined);
  const writeReport = vi.fn(() => "/project/feature/review.md");
  const application = new PhaseReviewPublicationApplication({
    commitReport,
    extractFindings: () => [{ affectedArea: "src/any.ts", findingSummary: "Finding", findingText: "Finding", severity: "required" }],
    ingest: vi.fn(() => integration(result, gateState)),
    persistFindings,
    recordApprovedEvidence,
    recordProgress,
    summarize: (output) => output.split("\n")[0]!,
    writeReport,
  });
  const review = {
    state: "V1_VALIDATED",
    manifest: { result },
    projection: {},
  } as Extract<ReviewOutputEnforcementResult, { state: "V1_VALIDATED" }>;
  const input = {
    cardKey: "feature:WORK",
    command: "continue-implementing" as const,
    databasePath: "/project/.hepha/hepha.sqlite",
    feature,
    model: "review-model",
    phase,
    phaseRef: "Phase 731",
    project,
    review,
    runId: "run",
    scope,
  };
  return { application, commitReport, input, persistFindings, recordApprovedEvidence, recordProgress, writeReport };
}

describe("phase review publication application", () => {
  it("publishes approval and returns an exact phase-exit receipt", async () => {
    const target = fixture();
    const result = await target.application.publish(target.input);
    expect(result.route).toBe("phase_exit");
    expect(result.gateApproved).toBe(true);
    expect(result.receipt).toEqual({
      contentHash: "a".repeat(64),
      databasePath: target.input.databasePath,
      scope,
    });
    expect(target.recordApprovedEvidence).toHaveBeenCalledWith(target.input.phase, "/project/feature/review.md");
    expect(target.commitReport).toHaveBeenCalledWith(expect.objectContaining({ reviewResult: "approved" }));
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "checkpoint" }));
  });

  it("projects needs-changes to the normal fixer route and diagnostic finding ledger", async () => {
    const target = fixture("NEEDS_CHANGES");
    const result = await target.application.publish(target.input);
    expect(result.route).toBe("fixer");
    expect(result.summaries.at(-1)).toContain("continuing with the fixer in the same run");
    expect(target.persistFindings).toHaveBeenCalledWith(expect.objectContaining({
      findings: [expect.objectContaining({ phaseNumber: 731, phaseTitle: "Any Name" })],
    }));
    expect(target.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      currentStep: "Resolve Code Review Findings Phase 731",
      status: "blocked",
    }));
  });

  it("keeps an approved but nonterminal review on the fixer route", async () => {
    const target = fixture("APPROVED", "PENDING");
    const result = await target.application.publish(target.input);
    expect(result.route).toBe("fixer");
    expect(result.gateApproved).toBe(false);
    expect(target.recordApprovedEvidence).not.toHaveBeenCalled();
    expect(target.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      currentStep: "Resolve Code Review Findings Phase 731",
      status: "blocked",
    }));
  });

  it("does not let diagnostic finding persistence block authoritative routing", async () => {
    const target = fixture("NEEDS_CHANGES");
    target.persistFindings.mockRejectedValue(new Error("diagnostic store unavailable"));
    await expect(target.application.publish(target.input)).resolves.toMatchObject({ route: "fixer" });
  });

  it("records and throws an authoritative reviewer blocker", async () => {
    const target = fixture("BLOCKED");
    await expect(target.application.publish(target.input)).rejects.toThrow("REVIEW_CONTRACT_V1_REVIEW_BLOCKED");
    expect(target.recordProgress).toHaveBeenLastCalledWith(expect.objectContaining({ status: "blocked" }));
  });

  it("fails closed when immutable ingestion refuses the artifact", async () => {
    const target = fixture();
    const refusing = new PhaseReviewPublicationApplication({
      commitReport: target.commitReport,
      extractFindings: () => [],
      ingest: () => ({ kind: "refusal", code: "persistence_failed", message: "No" }),
      persistFindings: target.persistFindings,
      recordApprovedEvidence: target.recordApprovedEvidence,
      recordProgress: target.recordProgress,
      summarize: (output) => output,
      writeReport: target.writeReport,
    });
    await expect(refusing.publish(target.input)).rejects.toThrow("REVIEW_CONTRACT_V1_INGESTION_DENIED");
    expect(target.writeReport).not.toHaveBeenCalled();
  });
});
