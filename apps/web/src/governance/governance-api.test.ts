import { afterEach, describe, expect, it, vi } from "vitest";
import type { GovernanceDashboardReadV1 } from "@hepha/shared";
import { fetchGovernanceDashboard, GovernanceApiError, submitGovernanceAction } from "./governance-api.js";

const originalFetch = globalThis.fetch;

function dashboard(): GovernanceDashboardReadV1 {
  const count = [{ key: "APPROVED", count: 1 }] as any;
  return {
    schemaVersion: "hepha-governance-dashboard/v1", projectId: "project-068",
    remediations: [],
    replans: [{ aggregateId: "aggregate-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", defectClass: "BOUNDARY", state: "REPLAN_PENDING_APPROVAL", eventVersion: 2, recurrence: { postFixManifestations: 1, acceptedScopeExpansions: 0 }, currentRequest: { requestId: "request-1", planHash: "c".repeat(64), planVersion: 1, requestedAt: "2026-07-20T00:00:00.000Z" }, scopeExpansionDecisions: [], replanDecisions: [], dispatch: null, summary: { observations: 1, requests: 1, decisions: 0, dispatchAttempts: 0, reviewAssessments: 1 }, availableActions: ["APPROVE_REPLAN"] }],
    architectureDebt: [],
    queue: [{ itemId: "replan:aggregate-1", itemKind: "REPLAN", targetId: "aggregate-1", featureId: "FEAT-068", state: "REPLAN_PENDING_APPROVAL", currentVersion: 2, requiresAction: true, urgency: "REPLAN_APPROVAL", summaryCode: "REPLAN_APPROVAL", availableActions: ["APPROVE_REPLAN"] }],
    metrics: { reviewResults: count, gateStates: count, cycleStates: count, findingDispositions: count, ruleReferences: count, recoveryStopReasons: [], replanStates: count, debtStates: [], debtPriorities: [], scopeDecisionOutcomes: [], replanDecisionOutcomes: [], futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [], pilotOutcomes: [], reviewRuns: 1 as any, openRemediationCycles: 0 as any, replanAggregates: 1 as any, architectureDebtRecords: 0 as any, actionableQueueItems: 1 as any, postFixManifestations: 1 as any, acceptedScopeExpansions: 0 as any },
    rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null },
  };
}

function response(body: unknown, status = 200): Response {
  return { json: async () => body, status } as Response;
}

afterEach(() => { globalThis.fetch = originalFetch; vi.restoreAllMocks(); });

describe("governance API adapter", () => {
  it("uses the project-scoped GET route and rejects an unsafe dashboard envelope", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(response({ kind: "governance_read", data: dashboard() }));
    await expect(fetchGovernanceDashboard("project-068")).resolves.toMatchObject({ kind: "dashboard", data: { projectId: "project-068" } });
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/projects/project-068/governance/dashboard");

    globalThis.fetch = vi.fn().mockResolvedValueOnce(response({ kind: "governance_read", data: { ...dashboard(), canonicalArtifact: "raw-evidence" } }));
    await expect(fetchGovernanceDashboard("project-068")).rejects.toBeInstanceOf(GovernanceApiError);

    const emptyMember = dashboard() as any;
    emptyMember.queue[0].summaryCode = "";
    globalThis.fetch = vi.fn().mockResolvedValueOnce(response({ kind: "governance_read", data: emptyMember }));
    await expect(fetchGovernanceDashboard("project-068")).rejects.toBeInstanceOf(GovernanceApiError);
  });

  it("posts only the confirmation-bound action to the project route and preserves a safe refusal", async () => {
    const draft = actionDraft();
    globalThis.fetch = vi.fn().mockResolvedValueOnce(response({ kind: "governance_action_refusal", code: "STALE_VERSION", message: "Version changed", currentVersion: 3 }));

    await expect(submitGovernanceAction("project-068", draft)).resolves.toMatchObject({ kind: "governance_action_refusal", code: "STALE_VERSION", currentVersion: 3 });
    const [route, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(route).toBe("/api/projects/project-068/governance/actions");
    expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } });
    const sent = JSON.parse((init as RequestInit).body as string);
    expect(sent).toMatchObject({ ...draft, confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: expect.stringMatching(/^[a-f0-9]{64}$/) } });
    expect(sent).not.toHaveProperty("actorId");
    expect(sent).not.toHaveProperty("authorizedRole");
  });

  it("accepts only a complete receipt bound to the request and a detached same-project refresh", async () => {
    const draft = actionDraft();
    const recorded = { kind: "governance_action_recorded", receipt: { actionId: draft.actionId, projectId: "project-068", kind: draft.kind, action: draft.action, targetKey: "aggregate-1", actorId: "steward", authorizedRole: "ARCHITECTURE_STEWARD", reason: draft.reason, expectedVersion: draft.expectedVersion, resultingVersion: 3, recordedAt: "2026-07-20T00:00:00.000Z", providerReceiptId: "receipt-1" }, refreshed: dashboard() };
    globalThis.fetch = vi.fn().mockResolvedValueOnce(response(recorded));
    const result = await submitGovernanceAction("project-068", draft);
    expect(result.kind).toBe("governance_action_recorded");
    if (result.kind === "governance_action_recorded") { expect(Object.isFrozen(result.refreshed)).toBe(true); expect(result.refreshed).not.toBe(recorded.refreshed); }
    const corruptions: Array<(response: any) => void> = [
      (body) => { delete body.receipt.providerReceiptId; }, (body) => { body.receipt.extra = "raw"; }, (body) => { body.receipt.kind = "LEGACY"; },
      (body) => { body.extra = "raw"; }, (body) => { body.receipt.action = "CONFIRM"; }, (body) => { body.receipt.authorizedRole = "FEATURE_OWNER"; }, (body) => { body.receipt.expectedVersion = -1; }, (body) => { body.receipt.resultingVersion = Number.MAX_SAFE_INTEGER + 1; },
      (body) => { body.receipt.actionId = "foreign-action"; }, (body) => { body.receipt.reason = "other reason"; }, (body) => { body.receipt.projectId = "foreign-project"; }, (body) => { body.refreshed.projectId = "foreign-project"; },
      (body) => { body.refreshed.canonicalArtifact = "raw"; }, (body) => { delete body.refreshed.metrics; }, (body) => { body.refreshed.queue[0].availableActions = ["CONFIRM"]; },
    ];
    for (const corrupt of corruptions) { const body = structuredClone(recorded); corrupt(body); globalThis.fetch = vi.fn().mockResolvedValueOnce(response(body)); await expect(submitGovernanceAction("project-068", draft)).rejects.toBeInstanceOf(GovernanceApiError); }
    for (const key of Object.keys(recorded.receipt)) {
      const body = structuredClone(recorded) as any;
      delete body.receipt[key];
      globalThis.fetch = vi.fn().mockResolvedValueOnce(response(body));
      await expect(submitGovernanceAction("project-068", draft)).rejects.toBeInstanceOf(GovernanceApiError);
    }
    for (const key of ["kind", "receipt", "refreshed"]) {
      const body = structuredClone(recorded) as any;
      delete body[key];
      globalThis.fetch = vi.fn().mockResolvedValueOnce(response(body));
      await expect(submitGovernanceAction("project-068", draft)).rejects.toBeInstanceOf(GovernanceApiError);
    }
  });

  it("rejects malformed GET and POST unions rather than returning raw response bodies", async () => {
    const invalidReads = [null, "body", { kind: "governance_read" }, { kind: "governance_read", data: dashboard(), extra: true }, { kind: "governance_read", data: { ...dashboard(), projectId: "foreign-project" } }, { kind: "governance_read_refusal", code: "UNKNOWN", message: "No" }, { kind: "governance_read_refusal", code: "PROJECT_NOT_FOUND" }, { kind: "governance_read_refusal", code: "PROJECT_NOT_FOUND", message: "", extra: true }];
    for (const body of invalidReads) { globalThis.fetch = vi.fn().mockResolvedValueOnce(response(body)); await expect(fetchGovernanceDashboard("project-068")).rejects.toBeInstanceOf(GovernanceApiError); }
    const invalidRefusals = [null, "body", { kind: "governance_action_refusal" }, { kind: "governance_action_refusal", code: "UNKNOWN", message: "No" }, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "" }, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "No", currentVersion: -1 }, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "No", currentVersion: 1.5 }, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "No", currentVersion: Number.MAX_SAFE_INTEGER + 1 }, { kind: "governance_action_refusal", code: "STALE_VERSION", message: "No", raw: "extra" }];
    for (const body of invalidRefusals) { globalThis.fetch = vi.fn().mockResolvedValueOnce(response(body)); await expect(submitGovernanceAction("project-068", actionDraft())).rejects.toBeInstanceOf(GovernanceApiError); }
  });
});

function actionDraft() {
  return { schemaVersion: "hepha-governance-action/v1", actionId: "action-1", kind: "REPLAN_DECISION", action: "APPROVE_REPLAN", target: { aggregateId: "aggregate-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", defectClass: "BOUNDARY", requestId: "request-1", planHash: "c".repeat(64), planVersion: 1 }, expectedVersion: 2, reason: "Operator reviewed the request", payload: {} };
}
