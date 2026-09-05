import { describe, expect, expectTypeOf, it } from "vitest";
import {
  projectGovernanceDashboardModel as projectPublicDashboard,
  type GovernanceActionRequestV1 as PublicActionRequest,
  type GovernanceDashboardReadV1 as PublicDashboard,
  type GovernanceNonNegativeIntegerV1,
} from "../src/index.js";
import type { GovernanceActionRequestV1 as BoundedActionRequest } from "../src/governance/action-contracts.js";
import {
  projectGovernanceDashboardModel as projectBoundedDashboard,
  type GovernanceDashboardReadV1 as BoundedDashboard,
} from "../src/governance/read-contracts.js";

const count = (value: number) => value as GovernanceNonNegativeIntegerV1;

function dashboard(): BoundedDashboard {
  return {
    schemaVersion: "hepha-governance-dashboard/v1",
    projectId: "project",
    remediations: [],
    replans: [],
    architectureDebt: [],
    queue: [],
    metrics: {
      reviewResults: [], gateStates: [], cycleStates: [], findingDispositions: [], ruleReferences: [], recoveryStopReasons: [],
      replanStates: [], debtStates: [], debtPriorities: [], scopeDecisionOutcomes: [], replanDecisionOutcomes: [],
      futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [], pilotOutcomes: [],
      reviewRuns: count(0), openRemediationCycles: count(0), replanAggregates: count(0), architectureDebtRecords: count(0),
      actionableQueueItems: count(0), postFixManifestations: count(0), acceptedScopeExpansions: count(0),
    },
    rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null },
  };
}

describe("shared governance contracts", () => {
  it("preserves the bounded read contract through the compatibility barrel", () => {
    expectTypeOf<BoundedDashboard>().toEqualTypeOf<PublicDashboard>();
    expect(projectPublicDashboard).toBe(projectBoundedDashboard);
  });

  it("detaches and freezes a valid read model", () => {
    const source = dashboard();
    const projected = projectBoundedDashboard(source);

    expect(projected).toEqual(source);
    expect(projected).not.toBe(source);
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected?.metrics)).toBe(true);
  });

  it("refuses malformed dashboard transport", () => {
    expect(projectBoundedDashboard({ ...dashboard(), unexpected: true })).toBeUndefined();
    expect(projectBoundedDashboard({ ...dashboard(), projectId: "" })).toBeUndefined();
  });

  it("preserves the closed action request union through the compatibility barrel", () => {
    expectTypeOf<BoundedActionRequest>().toEqualTypeOf<PublicActionRequest>();
  });
});
