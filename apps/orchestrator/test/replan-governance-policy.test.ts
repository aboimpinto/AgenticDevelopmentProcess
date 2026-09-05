// Behavior suite: replan governance.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewGovernanceSqliteStore, type StoredReplanGovernanceAggregate } from "@hepha/db";
import {
  buildValidFinding,
  buildValidManifest,
  buildValidReplanPlan,
  computeReviewArtifactHash,
  type ReplanPlan,
} from "../src/review-contract-types.js";
import { validateReviewContractArtifact } from "../src/review-contract-integration-adapter.js";
import {
  authorizeLoopbackGovernanceDecision,
  buildApprovedBoundedReplanDispatch,
  evaluateReplanGovernance,
} from "../src/replan-governance-policy.js";

const hash = (character: string) => character.repeat(64);
const scope = {
  projectId: "hepha",
  featureId: "feat-066",
  phaseNumber: 3,
  reviewGateId: "code-review",
  defectClass: "replan-governance",
};
const now = "2026-07-17T12:00:00.000Z";

const activeRuleSnapshot = {
  schemaVersion: 1 as const,
  catalogSchemaVersion: 1 as const,
  ruleId: "replan-governance",
  ruleVersion: "1.0.0",
  category: "architecture" as const,
  scope: "review-governance",
  title: "Replan Governance",
  source: { document: "docs/architecture.md", section: "V1" },
  catalogPath: ".hepha/architecture-rules.yaml" as const,
  catalogSourceHash: hash("d"),
  ruleHash: hash("e"),
};

function aggregate(overrides: Partial<StoredReplanGovernanceAggregate> = {}): StoredReplanGovernanceAggregate {
  return {
    scope,
    aggregateId: "aggregate-066",
    eventVersion: 0,
    state: "NORMAL_REMEDIATION",
    observations: [],
    requests: [],
    scopeExpansionDecisions: [],
    decisions: [],
    transitions: [],
    dispatchAttempts: [],
    reviewAssessments: [],
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    aggregateId: "aggregate-066",
    scope,
    observationEventId: "post-fix-observation",
    observationKind: "POST_FIX_MANIFESTATION",
    triggerManifestHash: hash("a"),
    basisManifestHash: hash("b"),
    remediationCycleId: "cycle-066",
    ...overrides,
  };
}

function validatedV1Plan(overrides: Partial<ReplanPlan> = {}): ReplanPlan {
  const artifactScope = {
    projectId: scope.projectId,
    featureId: scope.featureId,
    phaseNumber: scope.phaseNumber,
    reviewGateId: scope.reviewGateId,
  };
  const manifest = buildValidManifest({
    artifactId: "manifest-066",
    scope: artifactScope,
    findings: [buildValidFinding({ findingId: "finding-066", defectClass: scope.defectClass })],
  });
  const manifestReference = {
    artifactKind: "review_manifest" as const,
    artifactId: manifest.artifactId,
    contentHash: hash("a"),
    relativePath: "features/feat-066/reviews/manifest-066.json",
  };
  const plan = buildValidReplanPlan({
    artifactId: "replan-066",
    scope: artifactScope,
    manifestReference,
    findingIds: ["finding-066"],
    defectClass: scope.defectClass,
    replanReason: "recurrence_signal",
    ...overrides,
  });
  const validation = validateReviewContractArtifact(JSON.stringify(plan), {
    featurePath: "features/feat-066",
    manifestContext: { manifest, reference: manifestReference, scope: artifactScope },
  });
  expect(validation).toMatchObject({ valid: true });
  return plan;
}

function dispatchForPlan(plan: ReplanPlan) {
  const planHash = computeReviewArtifactHash(plan);
  return buildApprovedBoundedReplanDispatch({
    aggregate: approvedAggregate(planHash),
    artifact: { artifactId: plan.artifactId, contentHash: planHash, relativePath: "artifacts/replan-066.json" },
    plan,
  });
}

function approvedAggregate(planHash: string): StoredReplanGovernanceAggregate {
  return aggregate({
    eventVersion: 3,
    state: "REPLAN_APPROVED",
    transitions: [
      { ...scope, aggregateId: "aggregate-066", transitionId: "threshold-transition-066", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold", triggerRecordId: "threshold-066", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
      { ...scope, aggregateId: "aggregate-066", transitionId: "request-transition-066", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request", triggerRecordId: "request-066", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
      { ...scope, aggregateId: "aggregate-066", transitionId: "approval-transition-066", fromState: "REPLAN_PENDING_APPROVAL", toState: "REPLAN_APPROVED", reasonCode: "approval", triggerRecordId: "approval-066", expectedVersion: 2, resultingVersion: 3, transitionedAt: now },
    ],
    requests: [{
      ...scope,
      aggregateId: "aggregate-066",
      requestId: "request-066",
      triggerEventId: "threshold-066",
      planHash,
      planVersion: 1,
      proposalAuthorActor: "review-agent:invocation-066",
      producerInvocationId: "invocation:066",
      policyId: "replan-governance-v1",
      policyVersion: 1,
      eligibleRoles: ["ARCHITECTURE_STEWARD"],
      requestedAt: now,
    }],
    decisions: [{
      ...scope,
      aggregateId: "aggregate-066",
      decisionId: "approval-066",
      requestId: "request-066",
      planHash,
      planVersion: 1,
      outcome: "APPROVE",
      actorId: "steward-066",
      authorizedRole: "ARCHITECTURE_STEWARD",
      policyId: "replan-governance-v1",
      policyVersion: 1,
      reason: "Approved bounded remediation.",
      expectedVersion: 2,
      resultingVersion: 3,
      decidedAt: now,
    }],
  });
}

describe("FEAT-066 public replan governance policy", () => {
  it("evaluates a reopened public aggregate losslessly through the Phase 2 store boundary", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "feat-066-policy-"));
    const databasePath = resolve(directory, "hepha.sqlite");
    const options = { currentActiveRuleSnapshots: [activeRuleSnapshot] };
    const firstStore = new ReviewGovernanceSqliteStore(databasePath, options);
    const first = firstStore.getReplanGovernanceAggregate(scope, "aggregate-066");
    firstStore.close();
    const reopenedStore = new ReviewGovernanceSqliteStore(databasePath, options);
    try {
      const reopened = reopenedStore.getReplanGovernanceAggregate(scope, "aggregate-066");
      expect(reopened).toEqual(first);
      expect(evaluateReplanGovernance({ aggregate: reopened, candidate: candidate() })).toMatchObject({ kind: "decision", action: "APPEND_OBSERVATION" });
    } finally {
      reopenedStore.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("counts only exact same-class recurrence evidence and stops at the second event", () => {
    const first = evaluateReplanGovernance({ aggregate: aggregate(), candidate: candidate() });
    expect(first).toMatchObject({ kind: "decision", action: "APPEND_OBSERVATION", state: "NORMAL_REMEDIATION", reasonCode: "first_post_fix_manifestation", expectedVersion: 0 });

    const firstObservation = {
      ...scope,
      aggregateId: "aggregate-066",
      observationEventId: "first-post-fix",
      observationKind: "POST_FIX_MANIFESTATION" as const,
      triggerManifestHash: hash("c"),
      basisManifestHash: hash("d"),
      remediationCycleId: "cycle-066",
      createdAt: now,
    };
    const second = evaluateReplanGovernance({
      aggregate: aggregate({ observations: [firstObservation] }),
      candidate: candidate({ observationEventId: "second-post-fix", triggerManifestHash: hash("e") }),
    });
    expect(second).toMatchObject({ kind: "decision", action: "APPEND_THRESHOLD", state: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "recurrence_threshold" });

    const initial = evaluateReplanGovernance({
      aggregate: aggregate(),
      candidate: candidate({ observationKind: "POST_FIX_MANIFESTATION", remediationCycleId: undefined }),
    });
    expect(initial).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });

    const duplicate = evaluateReplanGovernance({ aggregate: aggregate({ observations: [firstObservation] }), candidate: candidate({ observationEventId: "other", triggerManifestHash: hash("c") }) });
    expect(duplicate).toMatchObject({ kind: "refusal", code: "DUPLICATE_EVENT" });
    expect(evaluateReplanGovernance({
      aggregate: aggregate(),
      candidate: candidate({ scope: { ...scope, defectClass: "foreign-class" } }),
    })).toMatchObject({ kind: "refusal", code: "SCOPE_MISMATCH" });

    const exhaustiveCandidate = candidate({ observationKind: "FINDING_EXHAUSTIVENESS", findingObservationId: "finding-observation-066", remediationCycleId: undefined });
    const exhaustive = evaluateReplanGovernance({ aggregate: aggregate(), candidate: exhaustiveCandidate });
    expect(exhaustive).toMatchObject({ kind: "decision", action: "APPEND_THRESHOLD", reasonCode: "finding_exhaustiveness" });
    expect(evaluateReplanGovernance({
      aggregate: aggregate({ observations: [{
        ...scope,
        aggregateId: "aggregate-066",
        observationEventId: exhaustiveCandidate.observationEventId,
        observationKind: exhaustiveCandidate.observationKind,
        triggerManifestHash: exhaustiveCandidate.triggerManifestHash,
        basisManifestHash: exhaustiveCandidate.basisManifestHash,
        findingObservationId: exhaustiveCandidate.findingObservationId,
        createdAt: now,
      }] }),
      candidate: { ...exhaustiveCandidate, observationEventId: "exhaustive-replay" },
    })).toMatchObject({ kind: "refusal", code: "DUPLICATE_EVENT" });

    const firstExpansionDecision = {
      ...scope,
      aggregateId: "aggregate-066",
      decisionId: "expansion-decision-one",
      findingObservationId: "finding-observation-one",
      outcome: "ACCEPT" as const,
      actorId: "feature-owner-066",
      authorizedRole: "FEATURE_OWNER" as const,
      policyId: "replan-governance-v1" as const,
      policyVersion: 1 as const,
      reason: "Accepted exact scope expansion.",
      expectedVersion: 0,
      resultingVersion: 1,
      decidedAt: now,
    };
    const firstExpansion = evaluateReplanGovernance({
      aggregate: aggregate({ scopeExpansionDecisions: [firstExpansionDecision] }),
      candidate: candidate({ observationEventId: "expansion-one", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: hash("f"), findingObservationId: "finding-observation-one", decisionId: "expansion-decision-one", remediationCycleId: undefined }),
    });
    expect(firstExpansion).toMatchObject({ kind: "decision", action: "APPEND_OBSERVATION", reasonCode: "first_scope_expansion" });

    const secondExpansionDecision = { ...firstExpansionDecision, decisionId: "expansion-decision-two", findingObservationId: "finding-observation-two" };
    const secondExpansion = evaluateReplanGovernance({
      aggregate: aggregate({ observations: [{ ...scope, aggregateId: "aggregate-066", observationEventId: "expansion-one", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: hash("f"), basisManifestHash: hash("b"), findingObservationId: "finding-observation-one", decisionId: "expansion-decision-one", createdAt: now }], scopeExpansionDecisions: [firstExpansionDecision, secondExpansionDecision] }),
      candidate: candidate({ observationEventId: "expansion-two", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: hash("f"), findingObservationId: "finding-observation-two", decisionId: "expansion-decision-two", remediationCycleId: undefined }),
    });
    expect(secondExpansion).toMatchObject({ kind: "decision", action: "APPEND_THRESHOLD", state: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "recurrence_threshold" });
    expect(evaluateReplanGovernance({
      aggregate: aggregate({ observations: [{ ...scope, aggregateId: "aggregate-066", observationEventId: "expansion-one", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: hash("f"), basisManifestHash: hash("b"), findingObservationId: "finding-observation-one", decisionId: "expansion-decision-one", createdAt: now }], scopeExpansionDecisions: [firstExpansionDecision] }),
      candidate: candidate({ observationEventId: "expansion-replay", observationKind: "SCOPE_EXPANSION_ACCEPTED", triggerManifestHash: hash("f"), findingObservationId: "finding-observation-one", decisionId: "expansion-decision-one", remediationCycleId: undefined }),
    })).toMatchObject({ kind: "refusal", code: "DUPLICATE_EVENT" });
  });

  it("authorizes only an exact configured non-author steward at the current version", () => {
    const pending = aggregate({
      eventVersion: 2,
      state: "REPLAN_PENDING_APPROVAL",
      transitions: [
        { ...scope, aggregateId: "aggregate-066", transitionId: "threshold-transition-066", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold", triggerRecordId: "threshold-066", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
        { ...scope, aggregateId: "aggregate-066", transitionId: "request-transition-066", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request", triggerRecordId: "request-066", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
      ],
      requests: [{
        ...scope,
        aggregateId: "aggregate-066",
        requestId: "request-066",
        triggerEventId: "threshold-066",
        planHash: hash("a"),
        planVersion: 1,
        proposalAuthorActor: "review-agent:invocation-066",
        producerInvocationId: "invocation:066",
        policyId: "replan-governance-v1",
        policyVersion: 1,
        eligibleRoles: ["ARCHITECTURE_STEWARD"],
        requestedAt: now,
      }],
    });
    const request = { subject: "REPLAN" as const, requestId: "request-066", action: "APPROVE_REPLAN" as const, expectedVersion: 2, reason: "Approved bounded remediation." };
    const accepted = authorizeLoopbackGovernanceDecision({ aggregate: pending, request, authority: { actorId: "steward:loopback-066", roles: ["ARCHITECTURE_STEWARD"] }, decidedAt: "2026-07-17T12:00:00+00:00" });
    expect(accepted).toMatchObject({ kind: "authorized", outcome: "APPROVE", actorId: "steward:loopback-066", authorizedRole: "ARCHITECTURE_STEWARD", resultingVersion: 3 });

    expect(authorizeLoopbackGovernanceDecision({ aggregate: pending, request, authority: { actorId: "review-agent:invocation-066", roles: ["ARCHITECTURE_STEWARD"] }, decidedAt: now })).toMatchObject({ kind: "refusal", code: "SELF_APPROVAL" });
    expect(authorizeLoopbackGovernanceDecision({ aggregate: pending, request, authority: { actorId: "owner-066", roles: ["FEATURE_OWNER"] }, decidedAt: now })).toMatchObject({ kind: "refusal", code: "UNAUTHORIZED" });
    expect(authorizeLoopbackGovernanceDecision({ aggregate: pending, request: { ...request, expectedVersion: 1 }, authority: { actorId: "steward-066", roles: ["ARCHITECTURE_STEWARD"] }, decidedAt: now })).toMatchObject({ kind: "refusal", code: "STALE_VERSION" });
  });

  it("refuses a structurally valid but impossible transition or non-current request", () => {
    const impossible = aggregate({
      eventVersion: 1,
      state: "REPLAN_APPROVED",
      transitions: [{ ...scope, aggregateId: "aggregate-066", transitionId: "forged-transition-066", fromState: "NORMAL_REMEDIATION", toState: "REPLAN_APPROVED", reasonCode: "forged", triggerRecordId: "forged-decision-066", expectedVersion: 0, resultingVersion: 1, transitionedAt: now }],
    });
    expect(evaluateReplanGovernance({ aggregate: impossible, candidate: candidate() })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });

    const pending = aggregate({
      eventVersion: 2,
      state: "REPLAN_PENDING_APPROVAL",
      transitions: [
        { ...scope, aggregateId: "aggregate-066", transitionId: "threshold-transition-066", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold", triggerRecordId: "threshold-066", expectedVersion: 0, resultingVersion: 1, transitionedAt: now },
        { ...scope, aggregateId: "aggregate-066", transitionId: "request-transition-066", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request", triggerRecordId: "request-066", expectedVersion: 1, resultingVersion: 2, transitionedAt: now },
      ],
      requests: [
        { ...scope, aggregateId: "aggregate-066", requestId: "request-066", triggerEventId: "threshold-066", planHash: hash("a"), planVersion: 1, proposalAuthorActor: "review-agent:invocation-066", producerInvocationId: "invocation:066", policyId: "replan-governance-v1", policyVersion: 1, eligibleRoles: ["ARCHITECTURE_STEWARD"], requestedAt: now },
        { ...scope, aggregateId: "aggregate-066", requestId: "request-067", triggerEventId: "threshold-066", planHash: hash("b"), planVersion: 2, proposalAuthorActor: "review-agent:invocation-067", producerInvocationId: "invocation:067", policyId: "replan-governance-v1", policyVersion: 1, eligibleRoles: ["ARCHITECTURE_STEWARD"], requestedAt: now },
      ],
    });
    expect(authorizeLoopbackGovernanceDecision({
      aggregate: pending,
      request: { subject: "REPLAN", requestId: "request-066", action: "APPROVE_REPLAN", expectedVersion: 2, reason: "Approve." },
      authority: { actorId: "steward:loopback-066", roles: ["ARCHITECTURE_STEWARD"] },
      decidedAt: now,
    })).toMatchObject({ kind: "refusal", code: "PLAN_NOT_CURRENT" });
  });

  it("builds a complete immutable context only for the exact approved plan", () => {
    const plan = buildValidReplanPlan({
      artifactId: "replan-066",
      scope: { projectId: scope.projectId, featureId: scope.featureId, phaseNumber: scope.phaseNumber, reviewGateId: scope.reviewGateId },
      defectClass: scope.defectClass,
      manifestReference: { artifactKind: "review_manifest", artifactId: "manifest-066", contentHash: hash("a"), relativePath: "artifacts/manifest-066.json" },
    });
    const planHash = computeReviewArtifactHash(plan);
    const input = { aggregate: approvedAggregate(planHash), artifact: { artifactId: plan.artifactId, contentHash: planHash, relativePath: "artifacts/replan-066.json" }, plan };
    const inputSnapshot = JSON.stringify(input);
    const result = buildApprovedBoundedReplanDispatch(input);
    expect(result).toMatchObject({ kind: "dispatch", context: { planHash, requestId: "request-066", approvalDecisionId: "approval-066", remediationItems: [{ remediationItemId: "replan-fix-001" }], testMatrix: [{ testId: "replan-test-001" }] } });
    if (result.kind === "dispatch") {
      expect(Object.isFrozen(result.context)).toBe(true);
      expect(Object.isFrozen(result.context.remediationItems)).toBe(true);
      expect(Object.isFrozen(result.context.remediationItems[0])).toBe(true);
    }
    expect(JSON.stringify(input)).toBe(inputSnapshot);

    expect(buildApprovedBoundedReplanDispatch({ ...input, aggregate: approvedAggregate(planHash), plan: { ...plan, rootCause: "tampered plan" } })).toMatchObject({ kind: "refusal", code: "PLAN_NOT_CURRENT" });
    const { decisions: _decisions, ...pending } = approvedAggregate(planHash);
    expect(buildApprovedBoundedReplanDispatch({ ...input, aggregate: { ...pending, decisions: [], state: "REPLAN_PENDING_APPROVAL", eventVersion: 2, transitions: pending.transitions.slice(0, 2) } })).toMatchObject({ kind: "refusal", code: "INVALID_STATE" });
    const rejected = approvedAggregate(planHash);
    const rejectedTransition = { ...rejected.transitions[2], toState: "REPLAN_REJECTED" as const, reasonCode: "rejected" };
    expect(buildApprovedBoundedReplanDispatch({ ...input, aggregate: { ...rejected, state: "REPLAN_REJECTED", decisions: [{ ...rejected.decisions[0], outcome: "REJECT" }], transitions: [...rejected.transitions.slice(0, 2), rejectedTransition] } })).toMatchObject({ kind: "refusal", code: "INVALID_STATE" });
    expect(buildApprovedBoundedReplanDispatch({ ...input, aggregate: approvedAggregate(planHash), plan: { ...plan, testMatrix: [] } })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    expect(buildApprovedBoundedReplanDispatch({ ...input, aggregate: approvedAggregate(planHash), artifact: { ...input.artifact, relativePath: "/absolute/replan.json" } })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
  });

  it("projects every upstream-valid V1 surface shape and target-list limit without narrowing it", () => {
    const emptySurfaces = validatedV1Plan({
      surface: {
        inspected: [],
        affected: [{ surfaceId: "affected-1", relativePath: "src/affected.ts" }],
        confirmedUnaffected: [],
      },
    });
    const emptyResult = dispatchForPlan(emptySurfaces);
    expect(emptyResult).toMatchObject({ kind: "dispatch", context: { surface: { inspected: [], confirmedUnaffected: [] } } });
    if (emptyResult.kind === "dispatch") expect(Object.isFrozen(emptyResult.context.surface.inspected)).toBe(true);

    const overlapPlan = validatedV1Plan({
      surface: {
        inspected: [{ surfaceId: "affected-1", relativePath: "src/affected.ts" }],
        affected: [{ surfaceId: "affected-1", relativePath: "src/affected.ts" }],
        confirmedUnaffected: [],
      },
    });
    expect(dispatchForPlan(overlapPlan)).toMatchObject({ kind: "dispatch", context: { surface: { inspected: [{ surfaceId: "affected-1" }], affected: [{ surfaceId: "affected-1" }] } } });

    for (const targetCount of [65, 128]) {
      const targetSurfaceIds = Array.from({ length: targetCount }, (_, index) => `affected-${index + 1}`);
      const plan = validatedV1Plan({
        surface: { inspected: [], affected: targetSurfaceIds.map((surfaceId) => ({ surfaceId, relativePath: `src/${surfaceId}.ts` })), confirmedUnaffected: [] },
        remediationItems: [{ remediationItemId: "replan-fix-001", instruction: "Apply bounded remediation.", targetSurfaceIds }],
        testMatrix: [{ testId: "replan-test-001", requirement: "Verify bounded remediation.", targetSurfaceIds }],
      });
      const result = dispatchForPlan(plan);
      expect(result).toMatchObject({ kind: "dispatch" });
      if (result.kind === "dispatch") expect(result.context.testMatrix[0]?.targetSurfaceIds).toEqual(targetSurfaceIds);
    }

    const base = validatedV1Plan();
    const hashForBase = computeReviewArtifactHash(base);
    const dispatch = (plan: unknown) => buildApprovedBoundedReplanDispatch({
      aggregate: approvedAggregate(hashForBase),
      artifact: { artifactId: base.artifactId, contentHash: hashForBase, relativePath: "artifacts/replan-066.json" },
      plan,
    });
    for (const surface of [undefined, null, 1, [], { ...base.surface, inspected: [{ ...base.surface.inspected[0] }, { ...base.surface.inspected[0] }] }, { ...base.surface, affected: [{ ...base.surface.affected[0], surfaceId: "shared" }], confirmedUnaffected: [{ ...base.surface.confirmedUnaffected[0], surfaceId: "shared" }] }]) {
      expect(dispatch({ ...base, surface })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    }
    for (const key of ["inspected", "affected", "confirmedUnaffected"] as const) {
      const { [key]: _removed, ...withoutCollection } = base.surface;
      expect(dispatch({ ...base, surface: withoutCollection })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      for (const replacement of [null, 1, {}]) {
        expect(dispatch({ ...base, surface: { ...base.surface, [key]: replacement } })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      }
      expect(dispatch({ ...base, surface: { ...base.surface, [key]: Array.from({ length: 129 }, (_, index) => ({ surfaceId: `overflow-${index + 1}`, relativePath: `src/overflow-${index + 1}.ts` })) } })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    }
    expect(dispatch({ ...base, surface: { ...base.surface, affected: [] } })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    const targetIds = base.surface.affected.map((entry) => entry.surfaceId);
    for (const invalidTargets of [Array.from({ length: 129 }, (_, index) => `affected-${index + 1}`), [targetIds[0], targetIds[0]], ["missing-affected"]]) {
      expect(dispatch({ ...base, remediationItems: [{ ...base.remediationItems[0], targetSurfaceIds: invalidTargets }] })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      expect(dispatch({ ...base, testMatrix: [{ ...base.testMatrix[0], targetSurfaceIds: invalidTargets }] })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    }
  });

  it("refuses malformed UTF-16 at every public policy boundary while preserving supplementary text", () => {
    for (const malformed of ["\ud800", "\udc00", "\udc00\ud800", "\ud800x"]) {
      expect(evaluateReplanGovernance({
        aggregate: aggregate({ scope: { ...scope, projectId: `hepha-${malformed}` } }),
        candidate: candidate({ scope: { ...scope, projectId: `hepha-${malformed}` } }),
      })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      expect(authorizeLoopbackGovernanceDecision({
        aggregate: aggregate(),
        request: { subject: "REPLAN", requestId: "request-066", action: "APPROVE_REPLAN", expectedVersion: 0, reason: `Approve ${malformed}` },
        authority: { actorId: `steward-${malformed}`, roles: ["ARCHITECTURE_STEWARD"] },
        decidedAt: now,
      })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });

      const plan = validatedV1Plan();
      const planHash = computeReviewArtifactHash(plan);
      const dispatch = (patchedPlan: unknown, relativePath = "artifacts/replan-066.json") => buildApprovedBoundedReplanDispatch({
        aggregate: approvedAggregate(planHash),
        artifact: { artifactId: plan.artifactId, contentHash: planHash, relativePath },
        plan: patchedPlan,
      });
      for (const patchedPlan of [
        { ...plan, rootCause: malformed },
        { ...plan, manifestReference: { ...plan.manifestReference, relativePath: `reviews/${malformed}.json` } },
        { ...plan, surface: { ...plan.surface, affected: [{ ...plan.surface.affected[0], symbol: malformed }] } },
        { ...plan, surface: { ...plan.surface, affected: [{ ...plan.surface.affected[0], relativePath: `src/${malformed}.ts` }] } },
        { ...plan, explicitExclusions: [{ relativePath: "docs/excluded.md", rationale: malformed }] },
        { ...plan, explicitExclusions: [{ relativePath: `docs/${malformed}.md`, rationale: "Excluded safely." }] },
        { ...plan, remediationItems: [{ ...plan.remediationItems[0], instruction: malformed }] },
        { ...plan, testMatrix: [{ ...plan.testMatrix[0], requirement: malformed }] },
      ]) expect(dispatch(patchedPlan)).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      expect(dispatch(plan, `artifacts/${malformed}.json`)).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    }

    const supplementary = "Approved \u{1f680}";
    const plan = validatedV1Plan({ rootCause: supplementary });
    const planHash = computeReviewArtifactHash(plan);
    const result = buildApprovedBoundedReplanDispatch({
      aggregate: approvedAggregate(planHash),
      artifact: { artifactId: plan.artifactId, contentHash: planHash, relativePath: "artifacts/\u{1f680}.json" },
      plan,
    });
    expect(result).toMatchObject({ kind: "dispatch", context: { rootCause: supplementary, planRelativePath: "artifacts/\u{1f680}.json" } });
    if (result.kind === "dispatch") expect(Object.isFrozen(result.context)).toBe(true);
  });

  it("refuses malformed public inputs before nested consumption", () => {
    for (const input of [undefined, null, 42, [], {}, { aggregate: null, candidate: null }]) {
      expect(evaluateReplanGovernance(input)).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      expect(authorizeLoopbackGovernanceDecision(input)).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
      expect(buildApprovedBoundedReplanDispatch(input)).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
    }

    const malformedAggregate = aggregate({ requests: [{ ...scope, aggregateId: "aggregate-066" } as never] });
    expect(authorizeLoopbackGovernanceDecision({
      aggregate: malformedAggregate,
      request: { subject: "REPLAN", requestId: "request-066", action: "APPROVE_REPLAN", expectedVersion: 0, reason: "Approve." },
      authority: { actorId: "steward-066", roles: ["ARCHITECTURE_STEWARD"] },
      decidedAt: now,
    })).toMatchObject({ kind: "refusal", code: "INVALID_INPUT" });
  });
});
