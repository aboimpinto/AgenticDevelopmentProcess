import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { PhaseRemediationSuccessorApplication } from "../src/workflows/reviews/phase-remediation-successor-application.js";

function fixture() {
  const feature = { externalId: "WORK", folderPath: "/project/feature" } as WorkItemCard;
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const predecessor = {
    artifactKind: "review_manifest" as const, artifactId: "manifest", contentHash: "a".repeat(64),
    relativePath: "feature/code-reviews/artifacts/review_manifest/hash.json",
  };
  const predecessorFindings = [{ findingId: "predecessor-blocker", disposition: "IN_SCOPE_BLOCKER" as const }];
  const readLineage = vi.fn(() => ({ kind: "required" as const, predecessor, findings: predecessorFindings }));
  const resolveIdentityLease = vi.fn(({ predecessor: prior, scope }) => ({
    predecessor: prior, responseArtifactId: "response", receiptArtifactId: "receipt", scope,
  }));
  const application = new PhaseRemediationSuccessorApplication({
    canonicalFeatureId: () => "work",
    createArtifactId: (_phase, kind) => `${kind}-id`,
    projectLifecycle: (findings) => ({ requiredFindingIds: findings.map((finding) => finding.findingId), auditOnlyFindingIds: [] }),
    readLineage,
    resolveIdentityLease,
  });
  const input = {
    currentIdentityLease: null, feature,
    findings: [{ findingId: "finding-a", disposition: "IN_SCOPE_BLOCKER" as const }],
    phaseNumber: 287, phaseRef: "Phase 287", project,
    resolvingReviewFindings: true, reviewRequired: true, runId: "run",
  };
  return { application, input, predecessor, predecessorFindings, readLineage, resolveIdentityLease };
}

describe("phase remediation successor application", () => {
  it("prepares an exact immutable successor handoff", () => {
    const target = fixture();
    const result = target.application.prepare(target.input);
    expect(result.identityLease).toEqual(expect.objectContaining({ responseArtifactId: "response", receiptArtifactId: "receipt" }));
    expect(result.handoff).toEqual(expect.objectContaining({
      databasePath: "/project/.hepha/hepha.sqlite",
      featureRootPath: "feature",
      lifecycleProjection: { requiredFindingIds: ["predecessor-blocker"], auditOnlyFindingIds: [] },
      predecessor: target.predecessor,
    }));
  });

  it("clears a prior lease when the current task is not an authoritative fixer cycle", () => {
    const target = fixture();
    const result = target.application.prepare({ ...target.input, resolvingReviewFindings: false });
    expect(result).toEqual({ identityLease: null });
    expect(target.readLineage).not.toHaveBeenCalled();
  });

  it("fails closed when the exact predecessor cannot be read", () => {
    const target = fixture();
    target.readLineage.mockReturnValueOnce({ kind: "unavailable" });
    expect(() => target.application.prepare(target.input)).toThrow("authoritative remediation predecessor is unavailable");
    expect(target.resolveIdentityLease).not.toHaveBeenCalled();
  });

  it("does not allocate successors when no predecessor is required", () => {
    const target = fixture();
    target.readLineage.mockReturnValueOnce({ kind: "not_required" });
    expect(target.application.prepare(target.input)).toEqual({ identityLease: null });
    expect(target.resolveIdentityLease).not.toHaveBeenCalled();
  });
});
