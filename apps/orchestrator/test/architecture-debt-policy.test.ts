// Behavior suite: architecture debt.
import { describe, expect, it } from "vitest";
import type { ArchitectureDebtState } from "@hepha/db";
import {
  evaluateArchitectureDebtTriage,
  evaluateFutureTouch,
  type ArchitectureDebtPolicyAggregateV1,
  type ArchitectureDebtTriageOperation,
  type FutureTouchDecisionKind,
} from "../src/architecture-debt-policy.js";

const hash = (character: string) => character.repeat(64);
const now = "2026-07-18T20:00:00.000Z";
const authority = { actorId: "steward-067", verifiedRole: "ARCHITECTURE_STEWARD" as const };
const recordId = `ARCH-DEBT-${"a".repeat(32)}`;
const targetId = `ARCH-DEBT-${"b".repeat(32)}`;

function aggregate(overrides: Partial<ArchitectureDebtPolicyAggregateV1> = {}): ArchitectureDebtPolicyAggregateV1 {
  return {
    schemaVersion: 1,
    recordId,
    projectId: "hepha",
    eventVersion: 0,
    state: "PENDING_TRIAGE",
    ownerId: "steward-067",
    rationale: "Deferred historical boundary remediation.",
    risk: "Boundary policy drift remains visible.",
    architecturalBoundary: "rule-scope:orchestrator",
    priority: "P2",
    prioritySource: "AUTO_PENDING_DEFAULT",
    futureTouchTrigger: { triggerId: "touch-observed-surface", name: "Touch observed surface", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["evaluateDebt"], ruleTags: ["architecture-debt"] },
    discovery: {
      featureId: "feat-067", phaseNumber: 2, reviewGateId: "code-review", findingId: "finding-067",
      manifest: { artifactKind: "review_manifest", artifactId: "manifest-067", contentHash: hash("a"), relativePath: "artifacts/manifest-067.json" },
      observation: { artifactKind: "debt_observation", artifactId: "observation-067", contentHash: hash("b"), relativePath: "artifacts/observation-067.json" },
      currentFeatureImpact: "untouched_non_blocking",
    },
    rule: { ruleId: "architecture-debt", ruleVersion: "1", ruleHash: hash("c"), catalogHash: hash("d"), category: "architecture", sourceReference: ".hepha/architecture-rules.yaml" },
    locations: [{ locationId: "location-067", relativePath: "apps/orchestrator/src/debt.ts", symbol: "evaluateDebt", ruleTags: ["architecture-debt"] }],
    observationReferences: [{ artifactKind: "debt_observation", artifactId: "observation-067", contentHash: hash("b"), relativePath: "artifacts/observation-067.json" }],
    ...overrides,
  };
}

function action(operation: ArchitectureDebtTriageOperation, source = aggregate()): Record<string, unknown> {
  const base = { operation, projectId: source.projectId, recordId: source.recordId, expectedVersion: source.eventVersion, reason: "Architecture steward records an explicit governed decision.", occurredAt: now };
  if (operation === "CONFIRM") return { ...base, ownerId: "owner-067", rationale: "Confirmed architecture debt.", risk: "Known boundary risk.", architecturalBoundary: "orchestrator-policy", priority: "P1", futureTouchTrigger: { triggerId: "policy-touch", name: "Policy touch", paths: ["apps/orchestrator/src"], symbols: [], ruleTags: ["architecture-debt"] } };
  if (operation === "REASSIGN") return { ...base, ownerId: "owner-067" };
  if (operation === "MERGE" || operation === "SUPERSEDE") return { ...base, targetAggregate: aggregate({ recordId: targetId, state: "CONFIRMED" }) };
  if (operation === "PLAN_LINK") return { ...base, featureId: "feat-099", phaseTask: "phase-6.task-remediate" };
  if (operation === "ACCEPT_RISK") return { ...base, reviewTrigger: "next-policy-review" };
  if (operation === "CLOSE") return { ...base, closureEvidence: "Focused regression test proves the remediation." };
  return base;
}
function triage(operation: ArchitectureDebtTriageOperation, source = aggregate(), overrides: Record<string, unknown> = {}) {
  return evaluateArchitectureDebtTriage({ aggregate: source, authority, action: { ...action(operation, source), ...overrides } });
}
function decision(kind: FutureTouchDecisionKind, source = aggregate(), overrides: Record<string, unknown> = {}) {
  const base = {
    decisionId: `decision-${kind.toLowerCase()}`, projectId: "hepha", featureId: "feat-099", touchPlanHash: hash("e"), recordId: source.recordId, recordVersion: source.eventVersion,
    selectorIds: ["location:location-067:path", "location:location-067:rule:architecture-debt", "trigger:touch-observed-surface:path:apps/orchestrator/src/debt.ts", "trigger:touch-observed-surface:rule:architecture-debt"],
    kind, actorId: authority.actorId, authorizedRole: "ARCHITECTURE_STEWARD" as const, reason: "Exact structured touch decision.", occurredAt: now,
  };
  if (kind === "REMEDIATE") return { ...base, owningPhaseTask: "phase-6.task-remediate", acceptanceObligation: "Remediate exact matched debt." , ...overrides };
  if (kind === "PREREQUISITE") return { ...base, prerequisiteFeatureId: "feat-098", orderingEvidence: "feat-098 precedes feat-099.", completionCondition: "feat-098 is complete.", ...overrides };
  if (kind === "WAIVER") return { ...base, reconsiderationTrigger: "next-policy-review", ...overrides };
  return { ...base, inspectedBoundary: "orchestrator debt boundary", explanation: "The planned change does not interact with the matched behavior.", ...overrides };
}
function touch(decisions: readonly unknown[], overrides: Record<string, unknown> = {}) {
  return evaluateFutureTouch({
    touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: ["apps/orchestrator/src/debt.ts"], symbols: [], ruleTags: ["architecture-debt"] },
    touchPlanHash: hash("e"), aggregates: [aggregate()], decisions, authority, ...overrides,
  });
}

describe("E013-AD-002: architecture-debt triage and future-touch policy", () => {
  it("accepts every permitted steward transition with an exact operation-owned event union", () => {
    const controls: readonly [ArchitectureDebtState, ArchitectureDebtTriageOperation][] = [
      ["PENDING_TRIAGE", "CONFIRM"], ["PENDING_TRIAGE", "REJECT"], ["PENDING_TRIAGE", "MERGE"], ["PENDING_TRIAGE", "REASSIGN"], ["PENDING_TRIAGE", "DEFER"], ["PENDING_TRIAGE", "ACCEPT_RISK"], ["PENDING_TRIAGE", "PLAN_LINK"], ["PENDING_TRIAGE", "SUPERSEDE"],
      ["CONFIRMED", "MERGE"], ["CONFIRMED", "REASSIGN"], ["CONFIRMED", "DEFER"], ["CONFIRMED", "ACCEPT_RISK"], ["CONFIRMED", "PLAN_LINK"], ["CONFIRMED", "CLOSE"], ["CONFIRMED", "SUPERSEDE"],
      ["DEFERRED", "CONFIRM"], ["DEFERRED", "MERGE"], ["DEFERRED", "REASSIGN"], ["DEFERRED", "ACCEPT_RISK"], ["DEFERRED", "PLAN_LINK"], ["DEFERRED", "CLOSE"], ["DEFERRED", "SUPERSEDE"],
      ["ACCEPTED_RISK", "CONFIRM"], ["ACCEPTED_RISK", "REASSIGN"], ["ACCEPTED_RISK", "PLAN_LINK"], ["ACCEPTED_RISK", "CLOSE"], ["ACCEPTED_RISK", "SUPERSEDE"],
      ["PLANNED", "REASSIGN"], ["PLANNED", "DEFER"], ["PLANNED", "ACCEPT_RISK"], ["PLANNED", "CLOSE"], ["PLANNED", "SUPERSEDE"],
    ];
    const eventKeys: Readonly<Record<ArchitectureDebtTriageOperation, readonly string[]>> = {
      CONFIRM: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "ownerId", "rationale", "risk", "architecturalBoundary", "priority", "futureTouchTrigger"],
      REJECT: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt"],
      MERGE: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "targetRecordId"],
      REASSIGN: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "ownerId"],
      DEFER: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt"],
      ACCEPT_RISK: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "reviewTrigger"],
      PLAN_LINK: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "featureId", "phaseTask"],
      CLOSE: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "closureEvidence"],
      SUPERSEDE: ["operation", "projectId", "recordId", "actorId", "authorizedRole", "reason", "expectedVersion", "resultingVersion", "occurredAt", "targetRecordId"],
    };
    for (const [state, operation] of controls) {
      const result = triage(operation, aggregate({ state }));
      expect(result).toMatchObject({ kind: "accepted", event: { operation, actorId: "steward-067", authorizedRole: "ARCHITECTURE_STEWARD", expectedVersion: 0, resultingVersion: 1 } });
      if (result.kind === "accepted") expect(Object.keys(result.event).sort()).toEqual([...eventKeys[operation]].sort());
    }
    const confirmed = triage("CONFIRM");
    expect(confirmed).toMatchObject({ kind: "accepted", nextAggregate: { state: "CONFIRMED", ownerId: "owner-067", priority: "P1", prioritySource: "STEWARD_CONFIRMED", architecturalBoundary: "orchestrator-policy" } });
    const merged = triage("MERGE");
    const superseded = triage("SUPERSEDE");
    expect(merged).toMatchObject({ kind: "accepted", event: { targetRecordId: targetId }, nextAggregate: { duplicateOfRecordId: targetId } });
    expect(superseded).toMatchObject({ kind: "accepted", event: { targetRecordId: targetId }, nextAggregate: { supersededByRecordId: targetId } });
  });

  it("refuses malformed boundaries, stale or foreign identity, wrong authority, and impossible transitions", () => {
    for (const input of [undefined, null, 1, [], {}, { aggregate: null, authority: null, action: null }]) expect(evaluateArchitectureDebtTriage(input)).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(triage("CONFIRM", aggregate(), { expectedVersion: 1 })).toMatchObject({ kind: "refusal", code: "stale_version" });
    expect(triage("CONFIRM", aggregate(), { projectId: "foreign" })).toMatchObject({ kind: "refusal", code: "foreign_identity" });
    expect(evaluateArchitectureDebtTriage({ aggregate: aggregate(), authority: { actorId: "owner", verifiedRole: "FEATURE_OWNER" }, action: action("CONFIRM") })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(triage("CLOSE", aggregate({ state: "PENDING_TRIAGE" }))).toMatchObject({ kind: "refusal", code: "invalid_transition" });
    expect(triage("DEFER", aggregate({ state: "CLOSED" }))).toMatchObject({ kind: "refusal", code: "invalid_transition" });
    expect(triage("CONFIRM", aggregate(), { reason: "" })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(triage("CONFIRM", aggregate(), { occurredAt: "clock-derived" })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(evaluateArchitectureDebtTriage({ aggregate: { ...aggregate(), locations: [null] }, authority, action: action("CONFIRM") })).toMatchObject({ kind: "refusal", code: "invalid_input" });
  });

  it("refuses missing, malformed, and cross-operation triage evidence without accepting a partial event", () => {
    const required: Readonly<Partial<Record<ArchitectureDebtTriageOperation, readonly string[]>>> = {
      CONFIRM: ["ownerId", "rationale", "risk", "architecturalBoundary", "priority", "futureTouchTrigger"], MERGE: ["targetAggregate"], REASSIGN: ["ownerId"], ACCEPT_RISK: ["reviewTrigger"], PLAN_LINK: ["featureId", "phaseTask"], CLOSE: ["closureEvidence"], SUPERSEDE: ["targetAggregate"],
    };
    for (const operation of ["CONFIRM", "REJECT", "MERGE", "REASSIGN", "DEFER", "ACCEPT_RISK", "PLAN_LINK", "CLOSE", "SUPERSEDE"] as const) {
      const source = operation === "CLOSE" ? aggregate({ state: "CONFIRMED" }) : aggregate();
      for (const field of required[operation] ?? []) {
        const incomplete = action(operation, source);
        delete incomplete[field];
        expect(evaluateArchitectureDebtTriage({ aggregate: source, authority, action: incomplete })).toMatchObject({ kind: "refusal", code: "invalid_input" });
      }
      const evidenceField = required[operation]?.[0] ?? "reason";
      for (const invalid of [null, 17, "\0malformed"]) {
        expect(triage(operation, source, { [evidenceField]: invalid })).toMatchObject({ kind: "refusal", code: "invalid_input" });
      }
      const crossOperationField = operation === "CONFIRM" || operation === "REASSIGN" ? "reviewTrigger" : "ownerId";
      expect(triage(operation, source, { [crossOperationField]: "foreign-operation-evidence" })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    }
    expect(triage("MERGE", aggregate(), { targetAggregate: aggregate({ recordId, state: "CONFIRMED" }) })).toMatchObject({ kind: "refusal", code: "invalid_target" });
    expect(triage("SUPERSEDE", aggregate(), { targetAggregate: aggregate({ recordId: targetId, projectId: "foreign", state: "CONFIRMED" }) })).toMatchObject({ kind: "refusal", code: "invalid_target" });
    expect(triage("MERGE", aggregate(), { targetAggregate: aggregate({ recordId: targetId, state: "CLOSED" }) })).toMatchObject({ kind: "refusal", code: "invalid_target" });
    expect(triage("SUPERSEDE", aggregate(), { targetAggregate: aggregate({ recordId: targetId, state: "CONFIRMED", supersededByRecordId: recordId }) })).toMatchObject({ kind: "refusal", code: "invalid_target" });
  });

  it("accepts each complete current future-touch decision and emits deterministic selector matches", () => {
    for (const kind of ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"] as const) {
      expect(touch([decision(kind)])).toMatchObject({ kind: "accepted", matches: [{ recordId, recordVersion: 0, decision: { kind } }] });
    }
    const result = touch([decision("REMEDIATE")]);
    if (result.kind === "accepted") expect(result.matches[0]?.selectorIds).toEqual([...result.matches[0]!.selectorIds].sort());
  });

  it("fails closed for malformed plans, exact future-touch union evidence, and stale or foreign decisions", () => {
    expect(touch([], { touchPlan: null })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([], { touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: ["unsafe/../debt.ts"], symbols: [], ruleTags: [] } })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([], { touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: [], symbols: [], ruleTags: [] } })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([], { touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: ["apps/z.ts", "apps/a.ts"], symbols: [], ruleTags: [] } })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([], { touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: [], symbols: [{ relativePath: "apps/z.ts", symbol: "z" }, { relativePath: "apps/a.ts", symbol: "a" }], ruleTags: [] } })).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([], { touchPlan: { schemaVersion: "hepha-architecture-debt-touch-plan/v1", projectId: "hepha", featureId: "feat-099", paths: [], symbols: [], ruleTags: ["architecture-debt", "architecture-debt"] } })).toMatchObject({ kind: "refusal", code: "invalid_input" });

    const required: Readonly<Record<FutureTouchDecisionKind, readonly string[]>> = {
      REMEDIATE: ["owningPhaseTask", "acceptanceObligation"], PREREQUISITE: ["prerequisiteFeatureId", "orderingEvidence", "completionCondition"], WAIVER: ["reconsiderationTrigger"], NON_INTERACTION: ["inspectedBoundary", "explanation"],
    };
    const forbidden: Readonly<Record<FutureTouchDecisionKind, readonly string[]>> = {
      REMEDIATE: ["prerequisiteFeatureId", "orderingEvidence", "completionCondition", "waiverExpiry", "reconsiderationTrigger", "inspectedBoundary", "explanation"],
      PREREQUISITE: ["owningPhaseTask", "acceptanceObligation", "waiverExpiry", "reconsiderationTrigger", "inspectedBoundary", "explanation"],
      WAIVER: ["owningPhaseTask", "acceptanceObligation", "prerequisiteFeatureId", "orderingEvidence", "completionCondition", "inspectedBoundary", "explanation"],
      NON_INTERACTION: ["owningPhaseTask", "acceptanceObligation", "prerequisiteFeatureId", "orderingEvidence", "completionCondition", "waiverExpiry", "reconsiderationTrigger"],
    };
    for (const kind of ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"] as const) {
      for (const field of required[kind]) {
        const incomplete = decision(kind) as Record<string, unknown>;
        delete incomplete[field];
        expect(touch([incomplete])).toMatchObject({ kind: "refusal", code: "invalid_input" });
      }
      const evidenceField = required[kind][0]!;
      for (const invalid of [null, 17, "\0malformed"]) expect(touch([decision(kind, aggregate(), { [evidenceField]: invalid })])).toMatchObject({ kind: "refusal", code: "invalid_input" });
      for (const field of forbidden[kind]) expect(touch([decision(kind, aggregate(), { [field]: "cross-kind-evidence" })])).toMatchObject({ kind: "refusal", code: "invalid_input" });
      expect(touch([{ ...decision(kind), unknownEvidence: true }])).toMatchObject({ kind: "refusal", code: "invalid_input" });
    }
    expect(touch([decision("WAIVER", aggregate(), { reconsiderationTrigger: undefined, waiverExpiry: undefined })])).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([decision("WAIVER", aggregate(), { reconsiderationTrigger: undefined, waiverExpiry: "not-a-utc-timestamp" })])).toMatchObject({ kind: "refusal", code: "invalid_input" });
    expect(touch([decision("WAIVER", aggregate(), { reconsiderationTrigger: "\0malformed" })])).toMatchObject({ kind: "refusal", code: "invalid_input" });
    // Every decision binding is exact: no foreign project/hash/record or selector widening can match.
    expect(touch([decision("REMEDIATE", aggregate(), { projectId: "foreign-project" })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate(), { touchPlanHash: hash("f") })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate({ recordId: targetId }))])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate(), { recordVersion: 1 })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate(), { featureId: "feat-foreign" })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate(), { selectorIds: ["location:location-067:path"] })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE", aggregate(), { selectorIds: [...decision("REMEDIATE").selectorIds, "zz:unexpected-selector"] })])).toMatchObject({ kind: "refusal", code: "invalid_decision" });
    expect(touch([decision("REMEDIATE")], { authority: { actorId: "other-steward", verifiedRole: "ARCHITECTURE_STEWARD" } })).toMatchObject({ kind: "refusal", code: "invalid_decision" });
  });
});
