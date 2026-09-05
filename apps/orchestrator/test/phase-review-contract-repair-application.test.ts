import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseReviewContractRepairApplication } from "../src/workflows/reviews/phase-review-contract-repair-application.js";
import type { ReviewOutputEnforcementResult } from "../src/workflows/reviews/review-output-enforcement.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-phase-review-contract-repair-"));
  roots.push(root);
  const schemaRoot = resolve(root, ".hepha", "schemas");
  mkdirSync(schemaRoot, { recursive: true });
  writeFileSync(resolve(schemaRoot, "review-manifest-v1.schema.json"), "MANIFEST-SCHEMA", "utf8");
  writeFileSync(resolve(schemaRoot, "common-review-contract-types-v1.schema.json"), "COMMON-SCHEMA", "utf8");
  const phase = {
    documentPath: resolve(root, "phase-731-any-name.md"), fileName: "phase-731-any-name.md",
    number: 731, status: "AWAITING_REVIEW", title: "Any Name",
  } as PhaseSummary & { number: number };
  const feature = { externalId: "WORK", folderName: "arbitrary-feature", folderPath: root } as WorkItemCard;
  const project = { id: "arbitrary-project", rootPath: root } as StoredProject;
  const recordProgress = vi.fn(async () => undefined);
  const runWorker = vi.fn(async () => "corrected-draft");
  const valid = { state: "V1_VALIDATED" } as ReviewOutputEnforcementResult;
  const rejected = {
    state: "V1_REJECTED",
    rejection: { code: "invalid_shape", message: "Invalid review shape.", valid: false },
  } as ReviewOutputEnforcementResult;
  const input = {
    artifactId: "artifact",
    cardKey: "feature:WORK",
    command: "continue-implementing" as const,
    feature,
    lineage: { kind: "not_required" as const },
    model: handoffPlan("review-model"),
    phase,
    phaseRef: "Phase 731",
    phaseTitle: phase.title,
    project,
    reviewOutput: "rejected-draft",
    runId: "run",
    scope: { featureId: "arbitrary-feature", phaseNumber: 731, projectId: project.id, reviewGateId: "code-review" as const },
  };
  return { feature, input, phase, project, recordProgress, rejected, runWorker, valid };
}

describe("phase review contract repair application", () => {
  it("returns a valid independent review without launching repair", async () => {
    const target = fixture();
    const application = new PhaseReviewContractRepairApplication({
      enforce: () => target.valid,
      recordProgress: target.recordProgress,
      runWorker: target.runWorker,
    });
    const result = await application.repair(target.input);
    expect(result).toEqual({ review: target.valid, reviewOutput: "rejected-draft", summary: null });
    expect(target.runWorker).not.toHaveBeenCalled();
  });

  it("repairs representation, revalidates it, and preserves review authority", async () => {
    const target = fixture();
    const application = new PhaseReviewContractRepairApplication({
      enforce: ({ reviewOutput }) => reviewOutput === "corrected-draft" ? target.valid : target.rejected,
      recordProgress: target.recordProgress,
      runWorker: target.runWorker,
    });
    const result = await application.repair(target.input);
    expect(result.review).toBe(target.valid);
    expect(result.reviewOutput).toBe("corrected-draft");
    expect(result.summary).toContain("repaired and revalidated");
    expect(target.recordProgress).toHaveBeenCalledWith(expect.objectContaining({ status: "code_review" }));
    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "review-contract-repair",
      prompt: expect.stringContaining("Repair only the JSON contract representation"),
    }));
  });

  it("stops safely when a repair makes no validation progress", async () => {
    const target = fixture();
    target.runWorker.mockResolvedValue("rejected-draft");
    const application = new PhaseReviewContractRepairApplication({
      enforce: () => target.rejected,
      recordProgress: target.recordProgress,
      runWorker: target.runWorker,
    });
    const result = await application.repair(target.input);
    expect(result.review.state).toBe("V1_REJECTED");
    expect(result.summary).toContain("no_progress");
    expect(target.runWorker).toHaveBeenCalledTimes(1);
  });
});
