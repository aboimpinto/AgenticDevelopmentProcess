import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GovernanceDashboardReadV1 } from "@hepha/shared";
import { projectGovernanceDashboardModel } from "@hepha/shared";
import { GovernanceDashboard } from "./GovernanceDashboard.js";
import type { GovernanceApi } from "./governance-api.js";

function dashboard(): GovernanceDashboardReadV1 {
  const counts = [{ key: "APPROVED", count: 1 }] as any;
  return {
    schemaVersion: "hepha-governance-dashboard/v1", projectId: "project-068",
    remediations: [{ reviewRunId: "review-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", manifestHash: "a".repeat(64), manifestResult: "NEEDS_CHANGES", ruleSnapshotHash: "b".repeat(64), createdAt: "2026-07-20T00:00:00.000Z", gate: { gateState: "REJECTED", reasonCode: "NEEDS_FIX", basisManifestHash: "a".repeat(64), cycleId: "cycle-1", decidedAt: "2026-07-20T00:00:00.000Z" }, cycleState: "OPEN", findings: [{ findingId: "finding-1", findingObservationId: "observation-1", disposition: "SCOPE_EXPANSION", severity: "required", defectClass: "BOUNDARY", summary: "Needs scope approval", scopeDecisionTarget: { aggregateId: "aggregate-1", expectedVersion: 2 } }], receipts: [] }],
    replans: [{ aggregateId: "aggregate-1", featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", defectClass: "BOUNDARY", state: "REPLAN_PENDING_APPROVAL", eventVersion: 2, recurrence: { postFixManifestations: 1, acceptedScopeExpansions: 0 }, currentRequest: { requestId: "request-1", planHash: "c".repeat(64), planVersion: 1, requestedAt: "2026-07-20T00:00:00.000Z" }, scopeExpansionDecisions: [], replanDecisions: [], dispatch: null, summary: { observations: 1, requests: 1, decisions: 0, dispatchAttempts: 0, reviewAssessments: 1 }, availableActions: ["APPROVE_REPLAN"] }],
    architectureDebt: [{ recordId: "debt-1", state: "PENDING_TRIAGE", eventVersion: 1, ownerId: "steward", priority: "P1", prioritySource: "AUTO_PENDING_DEFAULT", rule: { ruleId: "rule-1", ruleVersion: "1", category: "architecture", sourceReference: "catalog" }, architecturalBoundary: "web", rationale: "Debt rationale", risk: "medium", locations: [], futureTouchTrigger: { triggerId: "trigger-1", name: "future touch", paths: [], symbols: [], ruleTags: [] }, discovery: { featureId: "FEAT-068", phaseNumber: 4, reviewGateId: "gate-1", findingId: "finding-1" }, futureTouchDecisions: [], availableActions: [] }],
    queue: [{ itemId: "replan:aggregate-1", itemKind: "REPLAN", targetId: "aggregate-1", featureId: "FEAT-068", state: "REPLAN_PENDING_APPROVAL", currentVersion: 2, requiresAction: true, urgency: "REPLAN_APPROVAL", summaryCode: "REPLAN_APPROVAL", availableActions: ["APPROVE_REPLAN"] }],
    metrics: { reviewResults: counts, gateStates: counts, cycleStates: counts, findingDispositions: counts, ruleReferences: counts, recoveryStopReasons: [], replanStates: counts, debtStates: counts, debtPriorities: counts, scopeDecisionOutcomes: [], replanDecisionOutcomes: [], futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [], pilotOutcomes: [], reviewRuns: 1 as any, openRemediationCycles: 1 as any, replanAggregates: 1 as any, architectureDebtRecords: 1 as any, actionableQueueItems: 1 as any, postFixManifestations: 1 as any, acceptedScopeExpansions: 0 as any },
    rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null },
  };
}

function api(overrides: Partial<GovernanceApi> = {}): GovernanceApi {
  return { fetchDashboard: vi.fn().mockResolvedValue({ kind: "dashboard", data: dashboard() }), submitAction: vi.fn().mockResolvedValue({ kind: "governance_action_recorded", receipt: { action: "APPROVE_REPLAN" }, refreshed: dashboard() }), ...overrides } as unknown as GovernanceApi;
}

describe("GovernanceDashboard", () => {
  afterEach(cleanup);

  it("renders safe governance panels, metrics, and an ordered queue", async () => {
    render(<GovernanceDashboard projectId="project-068" api={api()} />);
    expect(screen.getByRole("status").textContent).toContain("Loading governance dashboard");
    expect(await screen.findByRole("heading", { name: "Governance dashboard" })).not.toBeNull();
    expect(screen.getByRole("region", { name: "Governance queue" }).textContent).toContain("REPLAN_APPROVAL");
    expect(screen.getByRole("region", { name: "Architecture debt details" }).textContent).toContain("Debt rationale");
    expect(screen.getByRole("region", { name: "Governance metrics" }).textContent).toContain("Actionable queue: 1");
  });

  it("requires keyboard-operable confirmation and refreshes only from the server receipt", async () => {
    const client = api();
    render(<GovernanceDashboard projectId="project-068" api={client} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ }));
    fireEvent.click(screen.getByRole("button", { name: "APPROVE_REPLAN" }));
    expect(screen.getByRole("dialog")).not.toBeNull();
    const confirm = screen.getByRole("button", { name: "Confirm APPROVE_REPLAN" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed by the operator" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(confirm);
    await waitFor(() => expect(client.submitAction).toHaveBeenCalledOnce());
    expect((await screen.findByRole("status")).textContent).toContain("refreshed from the server");
  });

  it("preserves the prior model and exposes a stale refusal with an explicit refresh", async () => {
    const client = api();
    vi.mocked(client.submitAction).mockResolvedValueOnce({ kind: "governance_action_refusal", code: "STALE_VERSION", message: "Version changed", currentVersion: 3 } as any);
    render(<GovernanceDashboard projectId="project-068" api={client} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ }));
    fireEvent.click(screen.getByRole("button", { name: "APPROVE_REPLAN" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reviewed by the operator" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm APPROVE_REPLAN" }));
    expect((await screen.findByRole("alert")).textContent).toContain("STALE_VERSION");
    expect(screen.getByText("Debt rationale")).not.toBeNull();
    expect((screen.getByRole("button", { name: "Refresh governance dashboard" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("renders explicit valid-empty governance states rather than treating a safe empty read as unavailable", async () => {
    const empty = dashboard();
    Object.assign(empty, { remediations: [], replans: [], architectureDebt: [], queue: [] });
    render(<GovernanceDashboard projectId="project-068" api={api({ fetchDashboard: vi.fn().mockResolvedValue({ kind: "dashboard", data: empty }) })} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    expect(screen.getByText("No governance queue items require attention.")).not.toBeNull();
    expect(screen.getByText("No remediation or replan records.")).not.toBeNull();
    expect(screen.getByText("No architecture debt records.")).not.toBeNull();
  });

  it("refuses malformed nested dashboard transport rather than rendering it as empty", () => {
    const malformed = dashboard() as any;
    malformed.queue[0].availableActions = "not-an-array";
    expect(projectGovernanceDashboardModel(malformed)).toBeUndefined();
  });

  it("accepts every closed dashboard discriminator and preserves queue order in a frozen detached model", () => {
    const validValues: Array<[string, readonly string[], (model: any, value: string) => void]> = [
      ["manifest result", ["APPROVED", "NEEDS_CHANGES", "BLOCKED"], (m, v) => { m.remediations[0].manifestResult = v; }],
      ["gate state", ["APPROVED", "REJECTED", "BLOCKED", "PENDING"], (m, v) => { m.remediations[0].gate.gateState = v; }],
      ["finding disposition", ["IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT", "OBSERVATION"], (m, v) => { m.remediations[0].findings[0].disposition = v; }],
      ["finding severity", ["blocker", "required", "note", "info"], (m, v) => { m.remediations[0].findings[0].severity = v; }],
      ["receipt subject kind", ["remediation_item", "test"], (m, v) => { m.remediations[0].receipts = [{ findingId: "finding-1", subjectKind: v, subjectId: "subject", outcome: "VERIFIED" }]; }],
      ["receipt outcome", ["VERIFIED", "FAILED", "NOT_VERIFIABLE", "PASSED", "NOT_RUN"], (m, v) => { m.remediations[0].receipts = [{ findingId: "finding-1", subjectKind: "test", subjectId: "subject", outcome: v }]; }],
      ["replan state", ["NORMAL_REMEDIATION", "REMEDIATION_REPLAN_REQUIRED", "REPLAN_PENDING_APPROVAL", "REPLAN_APPROVED", "REPLAN_REJECTED", "BOUNDED_REMEDIATION_DISPATCHED", "REVIEW_PENDING"], (m, v) => { m.replans[0].state = v; }],
      ["scope decision outcome", ["ACCEPT", "REJECT"], (m, v) => { m.replans[0].scopeExpansionDecisions = [{ decisionId: "decision", findingObservationId: "observation", outcome: v, actorId: "owner", authorizedRole: "FEATURE_OWNER", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; }],
      ["replan decision outcome", ["APPROVE", "REJECT"], (m, v) => { m.replans[0].replanDecisions = [{ decisionId: "decision", requestId: "request", planHash: "hash", planVersion: 1, outcome: v, actorId: "steward", authorizedRole: "ARCHITECTURE_STEWARD", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; }],
      ["dispatch outcome", ["STARTED", "START_FAILED"], (m, v) => { m.replans[0].dispatch = { outcome: v, workflowRunId: "run", attemptedAt: "now" }; }],
      ["replan available action", ["APPROVE_REPLAN", "REJECT_REPLAN"], (m, v) => { m.replans[0].availableActions = [v]; }],
      ["debt state", ["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED", "CLOSED", "REJECTED", "MERGED", "SUPERSEDED"], (m, v) => { m.architectureDebt[0].state = v; }],
      ["debt priority", ["P0", "P1", "P2", "P3"], (m, v) => { m.architectureDebt[0].priority = v; }],
      ["debt priority source", ["AUTO_PENDING_DEFAULT", "STEWARD_CONFIRMED"], (m, v) => { m.architectureDebt[0].prioritySource = v; }],
      ["future-touch kind", ["REMEDIATE", "PREREQUISITE", "WAIVER", "NON_INTERACTION"], (m, v) => { m.architectureDebt[0].futureTouchDecisions = [{ decisionId: "decision", featureId: "feat", touchPlanHash: "hash", recordVersion: 1, selectorIds: [], kind: v, actorId: "actor", authorizedRole: "ARCHITECTURE_STEWARD", reason: "reason", occurredAt: "now" }]; }],
      ["debt available action", ["ACCEPT_RISK", "CLOSE", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"], (m, v) => { m.architectureDebt[0].availableActions = [v]; }],
      ["queue urgency",  ["SCOPE_EXPANSION", "P0", "REPLAN_APPROVAL", "REPLAN_REQUIRED", "P1", "P2", "P3", "INFORMATIONAL"], (m, v) => { m.queue[0].urgency = v; }],
    ];
    for (const [label, values, assign] of validValues) for (const value of values) {
      const model = dashboard() as any;
      assign(model, value);
      const projected = projectGovernanceDashboardModel(model);
      expect(projected, `${label}: ${value}`).toBeDefined();
      expect(Object.isFrozen(projected)).toBe(true);
      expect(projected!.queue.map((item) => item.itemId)).toEqual(model.queue.map((item: any) => item.itemId));
    }
    for (const [itemKind, actions] of [["REMEDIATION", ["ACCEPT_SCOPE_EXPANSION", "REJECT_SCOPE_EXPANSION"]], ["REPLAN", ["APPROVE_REPLAN", "REJECT_REPLAN"]], ["ARCHITECTURE_DEBT", ["ACCEPT_RISK", "CLOSE", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"]]] as const) {
      for (const action of actions) {
        const model = dashboard() as any;
        model.queue[0].itemKind = itemKind;
        model.queue[0].availableActions = [action];
        expect(projectGovernanceDashboardModel(model), `${itemKind}: ${action}`).toBeDefined();
      }
    }
  });

  it("rejects unknown literals and mixed queue action families without coercion or empty fallbacks", () => {
    const invalidValues: Array<(model: any) => void> = [
      (m) => { m.remediations[0].manifestResult = "LEGACY"; }, (m) => { m.remediations[0].gate.gateState = "LEGACY"; },
      (m) => { m.remediations[0].findings[0].disposition = "LEGACY"; }, (m) => { m.remediations[0].findings[0].severity = "LEGACY"; },
      (m) => { m.remediations[0].receipts = [{ findingId: "finding-1", subjectKind: "legacy", subjectId: "subject", outcome: "VERIFIED" }]; },
      (m) => { m.remediations[0].receipts = [{ findingId: "finding-1", subjectKind: "test", subjectId: "subject", outcome: "LEGACY" }]; },
      (m) => { m.replans[0].state = "LEGACY"; }, (m) => { m.replans[0].dispatch = { outcome: "LEGACY", workflowRunId: "run", attemptedAt: "now" }; }, (m) => { m.replans[0].availableActions = ["CONFIRM"]; },
      (m) => { m.replans[0].scopeExpansionDecisions = [{ decisionId: "decision", findingObservationId: "observation", outcome: "LEGACY", actorId: "owner", authorizedRole: "FEATURE_OWNER", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; },
      (m) => { m.replans[0].scopeExpansionDecisions = [{ decisionId: "decision", findingObservationId: "observation", outcome: "ACCEPT", actorId: "owner", authorizedRole: "ARCHITECTURE_STEWARD", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; },
      (m) => { m.replans[0].replanDecisions = [{ decisionId: "decision", requestId: "request", planHash: "hash", planVersion: 1, outcome: "LEGACY", actorId: "steward", authorizedRole: "ARCHITECTURE_STEWARD", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; },
      (m) => { m.replans[0].replanDecisions = [{ decisionId: "decision", requestId: "request", planHash: "hash", planVersion: 1, outcome: "APPROVE", actorId: "steward", authorizedRole: "FEATURE_OWNER", reason: "reason", expectedVersion: 1, resultingVersion: 2, decidedAt: "now" }]; },
      (m) => { m.architectureDebt[0].state = "LEGACY"; }, (m) => { m.architectureDebt[0].priority = "P4"; }, (m) => { m.architectureDebt[0].prioritySource = "LEGACY"; },
      (m) => { m.architectureDebt[0].futureTouchDecisions = [{ decisionId: "decision", featureId: "feat", touchPlanHash: "hash", recordVersion: 1, selectorIds: [], kind: "LEGACY", actorId: "actor", authorizedRole: "ARCHITECTURE_STEWARD", reason: "reason", occurredAt: "now" }]; },
      (m) => { m.architectureDebt[0].futureTouchDecisions = [{ decisionId: "decision", featureId: "feat", touchPlanHash: "hash", recordVersion: 1, selectorIds: [], kind: "REMEDIATE", actorId: "actor", authorizedRole: "FEATURE_OWNER", reason: "reason", occurredAt: "now" }]; },
      (m) => { m.architectureDebt[0].availableActions = ["APPROVE_REPLAN"]; }, (m) => { m.queue[0].itemKind = "LEGACY"; }, (m) => { m.queue[0].urgency = "LEGACY"; }, (m) => { m.queue[0].availableActions = ["CONFIRM"]; },
    ];
    for (const corrupt of invalidValues) { const model = dashboard() as any; corrupt(model); expect(projectGovernanceDashboardModel(model)).toBeUndefined(); }
    for (const [itemKind, action] of [["REMEDIATION", "ACCEPT_SCOPE_EXPANSION"], ["REPLAN", "APPROVE_REPLAN"], ["ARCHITECTURE_DEBT", "CONFIRM"]]) { const model = dashboard() as any; model.queue[0].itemKind = itemKind; model.queue[0].availableActions = [action]; expect(projectGovernanceDashboardModel(model)).toBeDefined(); }
  });

  it("makes confirmed submission single-flight and allows a new deliberate flow after refusal", async () => {
    let settle!: (result: any) => void;
    const client = api({ submitAction: vi.fn().mockImplementation(() => new Promise((resolve) => { settle = resolve; })) });
    render(<GovernanceDashboard projectId="project-068" api={client} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ })); fireEvent.click(screen.getByRole("button", { name: "APPROVE_REPLAN" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reason" } }); fireEvent.click(screen.getByRole("checkbox"));
    const confirm = screen.getByRole("button", { name: "Confirm APPROVE_REPLAN" }); fireEvent.click(confirm); fireEvent.click(confirm); fireEvent.keyDown(confirm, { key: "Enter" }); fireEvent.keyDown(confirm, { key: "Enter" });
    await waitFor(() => expect(client.submitAction).toHaveBeenCalledOnce()); expect((confirm as HTMLButtonElement).disabled).toBe(true);
    settle({ kind: "governance_action_refusal", code: "STALE_VERSION", message: "Changed", currentVersion: 3 });
    await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ })); fireEvent.click(screen.getByRole("button", { name: "APPROVE_REPLAN" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Again" } }); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm APPROVE_REPLAN" }));
    await waitFor(() => expect(client.submitAction).toHaveBeenCalledTimes(2));
  });

  it("closes a settled single-flight dialog and replaces authority only from its server refresh", async () => {
    let settle!: (result: any) => void;
    const client = api({ submitAction: vi.fn().mockImplementation(() => new Promise((resolve) => { settle = resolve; })) });
    render(<GovernanceDashboard projectId="project-068" api={client} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    fireEvent.click(screen.getByRole("button", { name: /REPLAN: REPLAN_APPROVAL/ })); fireEvent.click(screen.getByRole("button", { name: "APPROVE_REPLAN" }));
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Reason" } }); fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirm APPROVE_REPLAN" }));
    await waitFor(() => expect(client.submitAction).toHaveBeenCalledOnce());
    const refreshed = dashboard() as any; refreshed.metrics.actionableQueueItems = 0;
    settle({ kind: "governance_action_recorded", receipt: { action: "APPROVE_REPLAN" }, refreshed });
    expect((await screen.findByText(/Recorded APPROVE_REPLAN; refreshed from the server/)).textContent).toContain("refreshed from the server");
    expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.getByText("Actionable queue: 0")).not.toBeNull();
  });

  it("shows debt detail context and named empty states through a keyboard-operable disclosure", async () => {
    const populated = dashboard() as any;
    populated.architectureDebt[0].locations = [{ locationId: "loc", relativePath: "apps/<safe>.ts", symbol: "symbol", endpoint: "GET /safe", ruleTags: ["tag"] }];
    populated.architectureDebt[0].futureTouchTrigger = { triggerId: "trigger", name: "Trigger", paths: ["apps/path.ts"], symbols: ["symbol"], ruleTags: ["tag"] };
    populated.architectureDebt[0].futureTouchDecisions = [{ decisionId: "decision", featureId: "feat", touchPlanHash: "hash", recordVersion: 1, selectorIds: ["selector"], kind: "REMEDIATE", actorId: "actor", authorizedRole: "ARCHITECTURE_STEWARD", reason: "<not markup>", occurredAt: "2026-07-20" }];
    render(<GovernanceDashboard projectId="project-068" api={api({ fetchDashboard: vi.fn().mockResolvedValue({ kind: "dashboard", data: populated }) })} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    const summary = screen.getByText("Inspect architecture debt context for debt-1"); fireEvent.keyDown(summary, { key: "Enter" }); fireEvent.click(summary);
    expect(screen.getByText("Architectural boundary")).not.toBeNull(); expect(screen.getByText(/apps\/\<safe\>\.ts/)).not.toBeNull(); expect(screen.getByText(/Decision ID: decision/)).not.toBeNull();
    for (const value of ["web", "medium", "symbol", "GET /safe", "tag", "trigger", "Trigger", "apps/path.ts", "selector", "feat", "hash", "REMEDIATE", "actor", "ARCHITECTURE_STEWARD", "<not markup>", "2026-07-20"]) expect(document.body.textContent).toContain(value);
    expect(document.querySelector("script")).toBeNull();
  });

  it("renders distinct named empty states for debt detail collections", async () => {
    render(<GovernanceDashboard projectId="project-068" api={api()} />);
    await screen.findByRole("heading", { name: "Governance dashboard" });
    fireEvent.click(screen.getByText("Inspect architecture debt context for debt-1"));
    expect(screen.getByText("No locations recorded.")).not.toBeNull();
    expect(screen.getByText("No future-touch trigger paths recorded.")).not.toBeNull();
    expect(screen.getByText("No future-touch trigger symbols recorded.")).not.toBeNull();
    expect(screen.getByText("No future-touch trigger rule tags recorded.")).not.toBeNull();
    expect(screen.getByText("No future-touch decisions recorded.")).not.toBeNull();
  });

  it("clears a prior project model, detail, and draft when a new project refuses", async () => {
    const projectAData = { ...dashboard(), projectId: "project-a" };
    const client = api({ fetchDashboard: vi.fn().mockResolvedValueOnce({ kind: "dashboard", data: projectAData }).mockResolvedValueOnce({ kind: "refusal", code: "PROJECT_NOT_FOUND", message: "Missing" }) });
    const { rerender } = render(<GovernanceDashboard projectId="project-a" api={client} />); await screen.findByRole("heading", { name: "Governance dashboard" });
    rerender(<GovernanceDashboard projectId="project-b" api={client} />);
    expect(screen.queryByText("Debt rationale")).toBeNull(); expect(screen.queryByText("Queue item detail")).toBeNull();
    expect((await screen.findByRole("alert")).textContent).toContain("PROJECT_NOT_FOUND"); expect(screen.queryByText("Debt rationale")).toBeNull(); expect(screen.queryByText("Queue item detail")).toBeNull();
  });
});
