import { describe, expect, it } from "vitest";
import { assessAuthoritativeReviewPhaseExit, assessPhaseExitCheckpoint } from "../src/phase-exit-checkpoint.js";

describe("phase exit checkpoint", () => {
  it("blocks a completed phase when code review is still missing", () => {
    expect(
      assessPhaseExitCheckpoint({
        completionEvidencePresent: true,
        phaseNumber: 4,
        phaseStatus: "COMPLETED",
        qualityGates: [
          { gate: "tests", status: "satisfied" },
          { gate: "code_review", status: "missing" },
        ],
      }),
    ).toEqual({
      allowed: false,
      missingGates: ["code_review"],
      reason: "Phase 4 cannot exit: required quality gates are missing (code_review).",
    });
  });

  it("blocks when the phase document has incomplete completion evidence", () => {
    const decision = assessPhaseExitCheckpoint({
      completionEvidencePresent: false,
      phaseNumber: 5,
      phaseStatus: "COMPLETED",
      qualityGates: [],
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("durable completion evidence");
  });

  it("fails closed for enforced Safety Kernel phases without persisted terminal evidence", () => {
    const decision = assessPhaseExitCheckpoint({
      completionEvidencePresent: true, phaseNumber: 6, phaseStatus: "COMPLETED", qualityGates: [],
      safetyKernel: { enforcementEnabled: true, manifestPersisted: false, terminalRemediationState: false },
    });
    expect(decision).toMatchObject({ allowed: false, missingGates: ["safety-kernel-manifest", "safety-kernel-remediation"] });
  });

  it("permits only a fresh exact-scope approved terminal V1 gate", () => {
    const scope = { projectId: "hepha", featureId: "feat-065", phaseNumber: 6, reviewGateId: "code-review" } as const;
    const triggerArtifactHash = "a".repeat(64);
    const genericCheckpoint = assessPhaseExitCheckpoint({
      completionEvidencePresent: true,
      phaseNumber: 6,
      phaseStatus: "COMPLETED",
      qualityGates: [{ gate: "tests", status: "satisfied" }, { gate: "code_review", status: "satisfied" }],
    });
    const gate = { ...scope, triggerArtifactHash, basisManifestHash: triggerArtifactHash, gateState: "APPROVED" as const, reasonCode: "approved_terminal_review", cycleId: "cycle-approved" };
    const cycle = { ...scope, cycleId: "cycle-approved", basisManifestHash: triggerArtifactHash, cycleState: "NO_REMEDIATION_REQUIRED" as const };
    const manifest = { ...scope, contentHash: triggerArtifactHash, artifactKind: "review_manifest" as const, schemaVersion: 1 as const, sourceMode: "v1_validated_ingress" as const };
    const run = { ...scope, manifestHash: triggerArtifactHash, manifestResult: "APPROVED" as const };
    const store = {
      getCurrentAuthoritativeReviewGate: () => gate,
      getArtifactByHash: () => manifest,
      getReviewRunByManifestHash: () => run,
      listRemediationCyclesByScope: () => [cycle],
    };

    expect(assessAuthoritativeReviewPhaseExit({
      scope, freshTriggerArtifactHash: triggerArtifactHash, persistenceReadBackVerified: true, store, genericCheckpoint,
    })).toMatchObject({ allowed: true });

    const denials = [
      { freshTriggerArtifactHash: "b".repeat(64) },
      { persistenceReadBackVerified: false },
      { store: { ...store, getCurrentAuthoritativeReviewGate: () => ({ ...gate, gateState: "PENDING" as const, reasonCode: "terminal_remediation_required" }) } },
      { store: { ...store, listRemediationCyclesByScope: () => [{ ...cycle, cycleState: "AWAITING_RECEIPT" as const }] } },
      { store: { ...store, getCurrentAuthoritativeReviewGate: () => ({ ...gate, phaseNumber: 7 }) } },
      { store: { ...store, getArtifactByHash: () => null } },
      { store: { ...store, getReviewRunByManifestHash: () => null } },
      { store: { ...store, getCurrentAuthoritativeReviewGate: () => { throw new Error("closed store"); } } },
    ];
    for (const denial of denials) {
      expect(assessAuthoritativeReviewPhaseExit({
        scope, freshTriggerArtifactHash: triggerArtifactHash, persistenceReadBackVerified: true, store, genericCheckpoint, ...denial,
      })).toMatchObject({ allowed: false });
    }
  });

  it("classifies every persisted replan aggregate state without throwing or treating malformed data as empty", () => {
    const scope = { projectId: "hepha", featureId: "feat-066", phaseNumber: 7, reviewGateId: "code-review" } as const;
    const manifestHash = "a".repeat(64);
    const genericCheckpoint = { allowed: true, reason: "Generic checkpoint passes.", missingGates: [] };
    const gate = { ...scope, triggerArtifactHash: manifestHash, basisManifestHash: manifestHash, gateState: "APPROVED" as const, reasonCode: "approved_terminal_review", cycleId: "cycle-approved" };
    const cycle = { ...scope, cycleId: "cycle-approved", basisManifestHash: manifestHash, cycleState: "NO_REMEDIATION_REQUIRED" as const };
    const manifest = { ...scope, contentHash: manifestHash, artifactKind: "review_manifest" as const, schemaVersion: 1 as const, sourceMode: "v1_validated_ingress" as const };
    const run = { ...scope, manifestHash, manifestResult: "APPROVED" as const };
    const aggregate = (state: string, overrides: Record<string, unknown> = {}) => ({
      scope: { ...scope, defectClass: "replan-governance" }, aggregateId: "aggregate-066", state,
      requests: [], reviewAssessments: [], ...overrides,
    });
    const approvedReviewPending = aggregate("REVIEW_PENDING", {
      requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 1 }],
      reviewAssessments: [{ reviewManifestHash: manifestHash, planHash: "b".repeat(64), planVersion: 1, outcome: "APPROVED" }],
    });
    const evaluate = (aggregates: unknown, listOverride?: unknown) => assessAuthoritativeReviewPhaseExit({
      scope, freshTriggerArtifactHash: manifestHash, persistenceReadBackVerified: true, replanGovernance: { required: true }, genericCheckpoint,
      store: {
        getCurrentAuthoritativeReviewGate: () => gate,
        getArtifactByHash: () => manifest,
        getReviewRunByManifestHash: () => run,
        listRemediationCyclesByScope: () => [cycle],
        ...(listOverride === undefined ? { listReplanGovernanceAggregates: () => aggregates } : { listReplanGovernanceAggregates: listOverride }),
      } as never,
    });

    expect(evaluate([])).toMatchObject({ allowed: true });
    expect(evaluate([aggregate("NORMAL_REMEDIATION")])).toMatchObject({ allowed: true });
    expect(evaluate([aggregate("NORMAL_REMEDIATION"), aggregate("NORMAL_REMEDIATION", { aggregateId: "aggregate-067", scope: { ...scope, defectClass: "other-class" } })])).toMatchObject({ allowed: true });
    expect(evaluate([approvedReviewPending])).toMatchObject({ allowed: true });
    expect(evaluate([aggregate("NORMAL_REMEDIATION"), approvedReviewPending])).toMatchObject({ allowed: true });

    for (const state of ["REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED"]) {
      expect(evaluate([aggregate(state)])).toMatchObject({ allowed: false });
    }
    for (const malformed of [
      undefined,
      null,
      7,
      [aggregate("UNKNOWN")],
      [aggregate("NORMAL_REMEDIATION", { scope: { ...scope, defectClass: "foreign-class", featureId: "foreign" } })],
      [aggregate("NORMAL_REMEDIATION", { requests: {} })],
      [aggregate("NORMAL_REMEDIATION", { reviewAssessments: [null] })],
      [aggregate("REVIEW_PENDING")],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "invalid", planVersion: 1 }] })],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 0 }], reviewAssessments: [{ reviewManifestHash: manifestHash, planHash: "b".repeat(64), planVersion: 1, outcome: "APPROVED" }] })],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 1 }], reviewAssessments: [{ reviewManifestHash: "c".repeat(64), planHash: "b".repeat(64), planVersion: 1, outcome: "APPROVED" }] })],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 1 }], reviewAssessments: [{ reviewManifestHash: manifestHash, planHash: "c".repeat(64), planVersion: 1, outcome: "APPROVED" }] })],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 1 }], reviewAssessments: [{ reviewManifestHash: manifestHash, planHash: "b".repeat(64), planVersion: 2, outcome: "APPROVED" }] })],
      [aggregate("REVIEW_PENDING", { requests: [{ requestId: "request-066", planHash: "b".repeat(64), planVersion: 1 }], reviewAssessments: [{ reviewManifestHash: manifestHash, planHash: "b".repeat(64), planVersion: 1, outcome: "REJECTED" }] })],
    ]) {
      expect(() => evaluate(malformed)).not.toThrow();
      expect(evaluate(malformed)).toMatchObject({ allowed: false });
    }
    expect(evaluate([], () => { throw new Error("read failure"); })).toMatchObject({ allowed: false });
    expect(evaluate([], null)).toMatchObject({ allowed: false });
    expect(evaluate([], undefined)).toMatchObject({ allowed: true });
    expect(assessPhaseExitCheckpoint({
      completionEvidencePresent: true, phaseNumber: 7, phaseStatus: "COMPLETED", qualityGates: [],
      authoritativeReview: { required: true, phaseExit: { scope, freshTriggerArtifactHash: manifestHash, persistenceReadBackVerified: true, replanGovernance: { required: true }, store: {
        getCurrentAuthoritativeReviewGate: () => gate, getArtifactByHash: () => manifest, getReviewRunByManifestHash: () => run,
        listRemediationCyclesByScope: () => [cycle], listReplanGovernanceAggregates: () => [aggregate("REPLAN_APPROVED")] as never,
      } } },
    })).toMatchObject({ allowed: false, missingGates: ["authoritative-v1-review"] });
  });

  it("fails closed inside the generic checkpoint when a required V1 receipt or store is unavailable", () => {
    const base = {
      completionEvidencePresent: true,
      phaseNumber: 6,
      phaseStatus: "COMPLETED",
      qualityGates: [{ gate: "tests", status: "satisfied" }],
      authoritativeReview: { required: true },
    } as const;
    expect(assessPhaseExitCheckpoint(base)).toMatchObject({
      allowed: false,
      missingGates: ["authoritative-v1-review"],
    });
  });

  it("permits a phase only after all required gates are durable", () => {
    expect(
      assessPhaseExitCheckpoint({
        completionEvidencePresent: true,
        phaseNumber: 4,
        phaseStatus: "COMPLETED",
        qualityGates: [
          { gate: "tests", status: "satisfied" },
          { gate: "code_review", status: "satisfied" },
        ],
      }),
    ).toMatchObject({ allowed: true, missingGates: [] });
  });
});
