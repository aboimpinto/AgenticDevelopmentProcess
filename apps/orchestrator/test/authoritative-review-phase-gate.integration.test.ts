// Behavior suite: authoritative review phase-gate integration.
import { describe, expect, it } from "vitest";

import { assessAuthoritativeReviewPhaseExit, assessPhaseExitCheckpoint } from "../src/phase-exit-checkpoint.js";

const scope = {
  projectId: "hepha",
  featureId: "feat-065",
  phaseNumber: 6,
  reviewGateId: "code-review",
} as const;
const hash = "a".repeat(64);

function checkpoint() {
  return assessPhaseExitCheckpoint({
    completionEvidencePresent: true,
    phaseNumber: scope.phaseNumber,
    phaseStatus: "COMPLETED",
    qualityGates: [{ gate: "tests", status: "satisfied" }, { gate: "code_review", status: "satisfied" }],
  });
}

function store(overrides: { gate?: unknown; manifest?: unknown; run?: unknown; cycles?: unknown; throws?: boolean } = {}) {
  const gate = overrides.gate ?? {
    ...scope, triggerArtifactHash: hash, basisManifestHash: hash, gateState: "APPROVED" as const, reasonCode: "approved_terminal_review", cycleId: "cycle-1",
  };
  const manifest = overrides.manifest ?? {
    ...scope, contentHash: hash, artifactKind: "review_manifest" as const, schemaVersion: 1 as const, sourceMode: "v1_validated_ingress" as const,
  };
  const run = overrides.run ?? { ...scope, manifestHash: hash, manifestResult: "APPROVED" as const };
  const cycles = overrides.cycles ?? [{ ...scope, cycleId: "cycle-1", basisManifestHash: hash, cycleState: "NO_REMEDIATION_REQUIRED" as const }];
  return {
    getCurrentAuthoritativeReviewGate: () => {
      if (overrides.throws) throw new Error("closed store");
      return gate as never;
    },
    getArtifactByHash: () => manifest as never,
    getReviewRunByManifestHash: () => run as never,
    listRemediationCyclesByScope: () => cycles as never,
  };
}

describe("E013-IR-007: assessAuthoritativeReviewPhaseExit", () => {
  it("permits only the fresh exact-scope approved terminal decision", () => {
    expect(assessAuthoritativeReviewPhaseExit({
      scope,
      freshTriggerArtifactHash: hash,
      persistenceReadBackVerified: true,
      store: store(),
      genericCheckpoint: checkpoint(),
    })).toMatchObject({ allowed: true });
  });

  it("fails closed for stale, rejected, pending, non-terminal, unreadable, and unavailable authority", () => {
    const cases = [
      { freshTriggerArtifactHash: "b".repeat(64), store: store() },
      { freshTriggerArtifactHash: hash, store: store({ gate: { ...scope, triggerArtifactHash: hash, basisManifestHash: hash, gateState: "REJECTED", reasonCode: "review_needs_changes", cycleId: "cycle-1" } }) },
      { freshTriggerArtifactHash: hash, store: store({ gate: { ...scope, triggerArtifactHash: hash, basisManifestHash: hash, gateState: "BLOCKED", reasonCode: "review_blocked", cycleId: "cycle-1" } }) },
      { freshTriggerArtifactHash: hash, store: store({ gate: { ...scope, triggerArtifactHash: hash, basisManifestHash: hash, gateState: "PENDING", reasonCode: "terminal_remediation_required", cycleId: "cycle-1" } }) },
      { freshTriggerArtifactHash: hash, store: store({ cycles: [{ ...scope, cycleId: "cycle-1", basisManifestHash: hash, cycleState: "AWAITING_RECEIPT" }] }) },
      { freshTriggerArtifactHash: hash, store: store({ manifest: {} }) },
      { freshTriggerArtifactHash: hash, store: store({ run: {} }) },
      { freshTriggerArtifactHash: hash, store: store({ throws: true }) },
    ];
    for (const candidate of cases) {
      expect(assessAuthoritativeReviewPhaseExit({
        scope,
        persistenceReadBackVerified: true,
        genericCheckpoint: checkpoint(),
        ...candidate,
      })).toMatchObject({ allowed: false });
    }
    expect(assessAuthoritativeReviewPhaseExit({
      scope,
      freshTriggerArtifactHash: hash,
      persistenceReadBackVerified: false,
      store: store(),
      genericCheckpoint: checkpoint(),
    })).toMatchObject({ allowed: false });
  });

  it("denies another phase or review gate and preserves safe rejected-gate evidence", () => {
    for (const activeScope of [
      { ...scope, phaseNumber: scope.phaseNumber + 1 },
      { ...scope, reviewGateId: "plan-review" },
    ]) {
      expect(assessAuthoritativeReviewPhaseExit({
        scope: activeScope,
        freshTriggerArtifactHash: hash,
        persistenceReadBackVerified: true,
        store: store(),
        genericCheckpoint: checkpoint(),
      })).toMatchObject({ allowed: false });
    }

    expect(assessAuthoritativeReviewPhaseExit({
      scope,
      freshTriggerArtifactHash: hash,
      persistenceReadBackVerified: true,
      store: store({
        gate: {
          ...scope,
          triggerArtifactHash: hash,
          basisManifestHash: hash,
          gateState: "REJECTED",
          reasonCode: "review_needs_changes",
          cycleId: "cycle-1",
        },
      }),
      genericCheckpoint: checkpoint(),
    })).toMatchObject({
      allowed: false,
      reason: expect.stringContaining("rejected (review_needs_changes)"),
      evidence: { gateState: "REJECTED", reasonCode: "review_needs_changes", triggerArtifactHash: hash },
    });
  });
});
