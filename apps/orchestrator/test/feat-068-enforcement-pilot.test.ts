import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GovernanceRolloutSqliteStore } from "@hepha/db";
import type { GovernanceDashboardReadV1 } from "@hepha/shared";
import { computeGovernanceActionDigest } from "../src/governance-action-service.js";
import { handleGovernanceActionRoute } from "../src/governance-http-routes.js";
import { canonicalizeGovernanceParityV1, recordGovernanceParity } from "../src/governance-parity-service.js";
import { disableGovernancePilot, evaluateGovernancePilotAdmission, evaluateGovernancePilotDispatch, type GovernancePilotConfiguration } from "../src/governance-rollout-policy.js";

const roots: string[] = [];
const originalConfig = process.env.HEPHA_GOVERNANCE_PILOT_CONFIG;
const originalActor = process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
const originalRoles = process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
const originalSteward = process.env.HEPHA_ARCHITECTURE_STEWARD_ID;
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); if (originalConfig === undefined) delete process.env.HEPHA_GOVERNANCE_PILOT_CONFIG; else process.env.HEPHA_GOVERNANCE_PILOT_CONFIG = originalConfig; if (originalActor === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID; else process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = originalActor; if (originalRoles === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ROLES; else process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = originalRoles; if (originalSteward === undefined) delete process.env.HEPHA_ARCHITECTURE_STEWARD_ID; else process.env.HEPHA_ARCHITECTURE_STEWARD_ID = originalSteward; });
const projectId = "project-pilot-068";
const now = () => "2026-07-20T16:00:00.000Z";
function databasePath(): string { const root = mkdtempSync(join(tmpdir(), "hepha-pilot-")); roots.push(root); return join(root, "hepha.sqlite"); }
function pilotEvents(path: string): unknown[] { const database = new DatabaseSync(path); try { return database.prepare("select project_id,event_version,pilot_id,event_kind,state,payload_json,occurred_at from hepha_governance_pilot_events order by event_version").all(); } finally { database.close(); } }
function configureLocalSteward(): void { process.env.HEPHA_GOVERNANCE_PILOT_CONFIG = JSON.stringify(config()); process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = "steward-068"; process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = "ARCHITECTURE_STEWARD"; process.env.HEPHA_ARCHITECTURE_STEWARD_ID = "steward-068"; }
function dashboard(): GovernanceDashboardReadV1 {
  const counts = [] as any[];
  return { schemaVersion: "hepha-governance-dashboard/v1", projectId, remediations: [], replans: [], architectureDebt: [], queue: [], metrics: { reviewResults: counts, gateStates: counts, cycleStates: counts, findingDispositions: counts, ruleReferences: counts, recoveryStopReasons: counts, replanStates: counts, debtStates: counts, debtPriorities: counts, scopeDecisionOutcomes: counts, replanDecisionOutcomes: counts, futureTouchDecisionKinds: counts, dispatchOutcomes: counts, shadowOutcomes: counts, pilotOutcomes: counts, reviewRuns: 0 as any, openRemediationCycles: 0 as any, replanAggregates: 0 as any, architectureDebtRecords: 0 as any, actionableQueueItems: 0 as any, postFixManifestations: 0 as any, acceptedScopeExpansions: 0 as any }, rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null } };
}
function config(): GovernancePilotConfiguration { return { pilotId: "pilot-068", projectId, featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, riskClassification: "LOW", allowedBoundary: "REVIEW_RECOVERY", pilotConfigHash: "a".repeat(64) }; }
function dispatchCandidate(sourceVersionHash: string, overrides: Record<string, unknown> = {}): Record<string, unknown> { return { projectId, pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64), sourceVersionHash, occurredAt: "2026-07-20T16:30:00.000Z", authorityAvailable: true, recurrenceStopped: false, ...overrides }; }
function admit(path: string, overrides: Record<string, unknown> = {}) {
  const parity = recordGovernanceParity({ databasePath: path, projectId, authoritative: dashboard(), dashboard: dashboard(), now });
  if (parity.kind !== "governance_parity_recorded") throw new Error("parity fixture must persist");
  const store = new GovernanceRolloutSqliteStore(path, now, projectId);
  const status = store.readStatus(projectId); if (status.kind !== "success" || !status.value.migration) throw new Error("migration fixture must persist");
  const candidate = canonicalizeGovernanceParityV1(dashboard()); if (!candidate) throw new Error("dashboard fixture must canonicalize");
  const result = evaluateGovernancePilotAdmission({ store, projectId, config: config(), target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, payload: { parityReceiptId: parity.receipt.receiptId, migrationAuditId: status.value.migration.auditId, expiresAt: "2026-07-20T17:00:00.000Z" }, expectedVersion: 0, reason: "The steward approves this exact low-risk pilot.", authority: { actorId: "steward-068", role: "ARCHITECTURE_STEWARD" }, sourceVersionHash: candidate.sourceVersionHash, now, ...overrides });
  return { store, result, sourceVersionHash: candidate.sourceVersionHash, parityReceiptId: parity.receipt.receiptId, migrationAuditId: status.value.migration.auditId };
}

async function postPilotAction(path: string, body: unknown, routeProjectId = projectId): Promise<Response> {
  const server = createServer((request, response) => { void handleGovernanceActionRoute(request, response, { findProject: (id) => id === projectId ? { id: projectId, rootPath: "/safe/pilot" } : undefined, provider: { load: () => ({ kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }) }, databasePath: path, now }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve)); const address = server.address(); if (!address || typeof address === "string") throw new Error("pilot server unavailable");
  try { return await fetch(`http://127.0.0.1:${address.port}/api/projects/${routeProjectId}/governance/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}
function confirmed(request: Record<string, unknown>): Record<string, unknown> { const digest = computeGovernanceActionDigest(request); if (!digest) throw new Error("pilot action must digest"); return { ...request, confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: digest } }; }

describe("FEAT-068 controlled enforcement pilot", () => {
  it("E013-GD-008 admits only one exact current low-risk pilot and permits only its exact dispatch candidate", () => {
    const path = databasePath(); const { store, result, sourceVersionHash } = admit(path);
    try {
      expect(result).toMatchObject({ kind: "admitted", status: { mode: "ACTIVE", eventVersion: 1, pilot: { pilotId: "pilot-068", featureId: "feat-068" } } });
      const active = store.readStatus(projectId); expect(active).toMatchObject({ kind: "success", value: { mode: "ACTIVE", eventVersion: 1 } });
      if (active.kind !== "success") throw new Error("active status required");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: dispatchCandidate(sourceVersionHash) })).toBe("ALLOW_EXACT_PILOT");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: dispatchCandidate(sourceVersionHash, { featureId: "feat-other" }) })).toBe("DENY");
      expect(evaluateGovernancePilotAdmission({ store, projectId, config: config(), target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, payload: { parityReceiptId: result.approval.parityReceiptId, migrationAuditId: result.approval.migrationAuditId, expiresAt: "2026-07-20T17:00:00.000Z" }, expectedVersion: 1, reason: "No second pilot is permitted.", authority: { actorId: "steward-068", role: "ARCHITECTURE_STEWARD" }, sourceVersionHash, now })).toMatchObject({ kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" });
      expect(store.readStatus(projectId)).toMatchObject({ kind: "success", value: { mode: "ACTIVE", eventVersion: 1 } });
    } finally { store.close(); }
  });

  it("E013-GD-008 rejects malformed or foreign dispatch candidates before routing and preserves exact active-pilot controls", () => {
    const path = databasePath(); const { store, result, sourceVersionHash } = admit(path);
    try {
      if (result.kind !== "admitted") throw new Error("dispatch fixture required");
      const active = store.readStatus(projectId); if (active.kind !== "success") throw new Error("active rollout status required");
      const valid = dispatchCandidate(sourceVersionHash);
      const { projectId: _missingProjectId, ...missingProjectId } = valid;
      const { pilotId: _missingPilotId, ...missingPilotId } = valid;
      const invalidInputs: unknown[] = [
        { projectId, status: active.value },
        { projectId, status: active.value, candidate: null },
        { projectId, status: active.value, candidate: "candidate" },
        { projectId, status: active.value, candidate: [] },
        { projectId, status: active.value, candidate: missingProjectId },
        { projectId, status: active.value, candidate: { ...valid, projectId: "INVALID" } },
        { projectId, status: active.value, candidate: missingPilotId },
        { projectId, status: active.value, candidate: { ...valid, pilotConfigHash: "A".repeat(64) } },
        { projectId, status: active.value, candidate: { ...valid, occurredAt: "not-a-utc-timestamp" } },
        { projectId, status: active.value, candidate: { ...valid, authorityAvailable: "true" } },
        { projectId, status: active.value, candidate: { ...valid, unexpected: true } },
      ];
      for (const input of invalidInputs) {
        expect(() => evaluateGovernancePilotDispatch(input)).not.toThrow();
        expect(evaluateGovernancePilotDispatch(input)).toBe("DENY");
      }
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, projectId: "project-other-068" } })).toBe("DENY");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, taskId: "wrong-task" } })).toBe("DENY");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, contractVersion: 2 } })).toBe("DENY");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, pilotConfigHash: "b".repeat(64) } })).toBe("DENY");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, sourceVersionHash: "c".repeat(64) } })).toBe("DENY");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, authorityAvailable: false } })).toBe("NEEDS_HUMAN");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, recurrenceStopped: true } })).toBe("NEEDS_HUMAN");
      expect(evaluateGovernancePilotDispatch({ projectId, status: active.value, candidate: { ...valid, occurredAt: "2026-07-20T17:00:00.000Z" } })).toBe("NEEDS_HUMAN");
    } finally { store.close(); }
  });

  it("E013-GD-008 refuses absent, mismatched, stale, and expired predicates without activating a pilot", () => {
    for (const overrides of [{ payload: { parityReceiptId: "foreign-parity", migrationAuditId: "foreign-audit", expiresAt: "2026-07-20T17:00:00.000Z" } }, { target: { pilotId: "pilot-068", featureId: "wrong-feature", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) } }, { expectedVersion: 1 }, { payload: { parityReceiptId: "parity-missing", migrationAuditId: "migration-missing", expiresAt: "2026-07-20T15:59:00.000Z" } }]) {
      const path = databasePath(); const { store, result } = admit(path, overrides);
      try { expect(result.kind).toBe("refusal"); expect(store.readStatus(projectId)).toMatchObject({ kind: "success", value: { mode: "DISABLED", eventVersion: 0, pilot: null } }); } finally { store.close(); }
    }
  });

  it("E013-GD-008 refuses a stale parity approval receipt without activating a pilot", () => {
    const path = databasePath(); const parity = recordGovernanceParity({ databasePath: path, projectId, authoritative: dashboard(), dashboard: dashboard(), now });
    if (parity.kind !== "governance_parity_recorded") throw new Error("parity fixture must persist");
    const store = new GovernanceRolloutSqliteStore(path, now, projectId);
    try {
      const status = store.readStatus(projectId); const source = canonicalizeGovernanceParityV1(dashboard());
      if (status.kind !== "success" || !status.value.migration || !source) throw new Error("stale approval fixture required");
      expect(evaluateGovernancePilotAdmission({ store, projectId, config: config(), target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, payload: { parityReceiptId: parity.receipt.receiptId, migrationAuditId: status.value.migration.auditId, expiresAt: "2026-07-21T17:00:00.000Z" }, expectedVersion: 0, reason: "A stale parity receipt cannot approve a pilot.", authority: { actorId: "steward-068", role: "ARCHITECTURE_STEWARD" }, sourceVersionHash: source.sourceVersionHash, now: () => "2026-07-21T16:01:00.000Z" })).toEqual({ kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" });
      expect(pilotEvents(path)).toEqual([]);
    } finally { store.close(); }
  });

  it("admits and disables the exact pilot through the real loopback POST boundary", async () => {
    const path = databasePath(); const parity = recordGovernanceParity({ databasePath: path, projectId, authoritative: dashboard(), dashboard: dashboard(), now });
    if (parity.kind !== "governance_parity_recorded") throw new Error("parity fixture required");
    const store = new GovernanceRolloutSqliteStore(path, now, projectId); const initial = store.readStatus(projectId); store.close();
    if (initial.kind !== "success" || !initial.value.migration) throw new Error("migration fixture required");
    const source = canonicalizeGovernanceParityV1(dashboard()); if (!source) throw new Error("source fixture required");
    configureLocalSteward();
    const admission = confirmed({ schemaVersion: "hepha-governance-action/v1", actionId: "pilot-admission-068", kind: "PILOT_ADMISSION", action: "APPROVE_PILOT", target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, expectedVersion: 0, reason: "The local steward approves the exact low-risk pilot.", payload: { parityReceiptId: parity.receipt.receiptId, migrationAuditId: initial.value.migration.auditId, expiresAt: "2026-07-20T17:00:00.000Z" } });
    const admitted = await postPilotAction(path, admission); const admittedBody = await admitted.json(); expect(admitted.status, JSON.stringify(admittedBody)).toBe(200); expect(admittedBody).toMatchObject({ kind: "governance_action_recorded", receipt: { kind: "PILOT_ADMISSION", authorizedRole: "ARCHITECTURE_STEWARD" }, refreshed: { rollout: { mode: "ACTIVE", eventVersion: 1 } } });
    const disablement = confirmed({ schemaVersion: "hepha-governance-action/v1", actionId: "pilot-disablement-068", kind: "PILOT_DISABLEMENT", action: "DISABLE_PILOT", target: { pilotId: "pilot-068" }, expectedVersion: 1, reason: "The local steward disables the exact pilot.", payload: { disableReason: "The operator stops autonomous dispatch." } });
    const disabled = await postPilotAction(path, disablement); expect(disabled.status).toBe(200); await expect(disabled.json()).resolves.toMatchObject({ kind: "governance_action_recorded", receipt: { kind: "PILOT_DISABLEMENT" }, refreshed: { rollout: { mode: "NEEDS_HUMAN", eventVersion: 2 } } });
    expect(source.sourceVersionHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("E013-GD-008 rejects absent/mismatched/stale parity and pilot-event persistence failures without activation", () => {
    const noParityPath = databasePath();
    const noParityStore = new GovernanceRolloutSqliteStore(noParityPath, now, projectId);
    try {
      expect(evaluateGovernancePilotAdmission({ store: noParityStore, projectId, config: config(), target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, payload: { parityReceiptId: "parity-missing", migrationAuditId: "migration-missing", expiresAt: "2026-07-20T17:00:00.000Z" }, expectedVersion: 0, reason: "No parity means no pilot.", authority: { actorId: "steward-068", role: "ARCHITECTURE_STEWARD" }, sourceVersionHash: "a".repeat(64), now })).toEqual({ kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" });
      expect(pilotEvents(noParityPath)).toEqual([]);
    } finally { noParityStore.close(); }

    const mismatchPath = databasePath(); const mismatched = dashboard() as any; mismatched.metrics.reviewRuns = 1;
    expect(recordGovernanceParity({ databasePath: mismatchPath, projectId, authoritative: dashboard(), dashboard: mismatched, now })).toMatchObject({ kind: "governance_parity_recorded", receipt: { result: "MISMATCH" } });
    const mismatchStore = new GovernanceRolloutSqliteStore(mismatchPath, now, projectId);
    try {
      const status = mismatchStore.readStatus(projectId); if (status.kind !== "success" || !status.value.parity || !status.value.migration) throw new Error("mismatch fixture required");
      expect(evaluateGovernancePilotAdmission({ store: mismatchStore, projectId, config: config(), target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, payload: { parityReceiptId: status.value.parity.receiptId, migrationAuditId: status.value.migration.auditId, expiresAt: "2026-07-20T17:00:00.000Z" }, expectedVersion: 0, reason: "A mismatch must never activate a pilot.", authority: { actorId: "steward-068", role: "ARCHITECTURE_STEWARD" }, sourceVersionHash: status.value.parity.sourceVersionHash, now })).toEqual({ kind: "refusal", code: "PILOT_PREREQUISITE_MISSING" });
      expect(pilotEvents(mismatchPath)).toEqual([]);
    } finally { mismatchStore.close(); }

    const failurePath = databasePath(); const prepared = admit(failurePath);
    try {
      if (prepared.result.kind !== "admitted") throw new Error("pilot admission fixture required");
      const database = new DatabaseSync(failurePath); database.exec("create trigger fail_pilot_event before insert on hepha_governance_pilot_events begin select raise(abort, 'injected failure'); end;"); database.close();
      expect(disableGovernancePilot({ store: prepared.store, projectId, pilotId: "pilot-068", expectedVersion: 1, reason: "A persistence failure must stop the pilot.", now })).toEqual({ kind: "refusal", code: "PERSISTENCE_FAILED" });
      expect(pilotEvents(failurePath)).toHaveLength(1);
    } finally { prepared.store.close(); }
  });

  it("E013-GD-008 refuses legacy authority, wrong scope/version, and missing parity through the public POST route without pilot events", async () => {
    configureLocalSteward();
    const path = databasePath(); const store = new GovernanceRolloutSqliteStore(path, now, projectId); const initial = store.readStatus(projectId); store.close();
    if (initial.kind !== "success" || !initial.value.migration) throw new Error("rollout fixture required");
    const base = { schemaVersion: "hepha-governance-action/v1", actionId: "pilot-route-refusal-068", kind: "PILOT_ADMISSION", action: "APPROVE_PILOT", target: { pilotId: "pilot-068", featureId: "feat-068", phaseContractId: "controlled-enforcement-pilot", taskId: "pilot-task-068", contractVersion: 1, pilotConfigHash: "a".repeat(64) }, expectedVersion: 0, reason: "The steward requests only the configured pilot.", payload: { parityReceiptId: "parity-missing", migrationAuditId: initial.value.migration.auditId, expiresAt: "2026-07-20T17:00:00.000Z" } };
    for (const { request, code } of [
      { request: confirmed(base), code: "PILOT_PREREQUISITE_MISSING" },
      { request: confirmed({ ...base, actionId: "pilot-route-wrong-scope-068", target: { ...base.target, taskId: "wrong-task" } }), code: "PILOT_PREREQUISITE_MISSING" },
      { request: confirmed({ ...base, actionId: "pilot-route-wrong-version-068", target: { ...base.target, contractVersion: 2 } }), code: "PILOT_PREREQUISITE_MISSING" },
      { request: confirmed({ ...base, actionId: "pilot-route-legacy-068", payload: { ...base.payload, legacyFingerprint: "legacy-fingerprint" } } as any), code: "INVALID_REQUEST" },
      { request: confirmed({ ...base, actionId: "pilot-route-caller-authority-068", actorId: "remote-operator" } as any), code: "INVALID_REQUEST" },
    ]) {
      const response = await postPilotAction(path, request);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code });
      expect(pilotEvents(path)).toEqual([]);
    }
    const foreign = await postPilotAction(path, confirmed({ ...base, actionId: "pilot-route-foreign-project-068" }), "foreign-project");
    expect(foreign.status).toBe(404);
    await expect(foreign.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PROJECT_NOT_FOUND" });
    expect(pilotEvents(path)).toEqual([]);
  });

  it("E013-GD-009 persists disablement across restart and returns needs-human for expiry or operator disablement", () => {
    const path = databasePath(); const { store, result } = admit(path);
    try {
      if (result.kind !== "admitted") throw new Error("admission control required");
      expect(disableGovernancePilot({ store, projectId, pilotId: "pilot-068", expectedVersion: 1, reason: "The operator stops this pilot immediately.", now })).toMatchObject({ kind: "disabled", status: { mode: "NEEDS_HUMAN", eventVersion: 2, pilot: { lastOutcome: "DISABLED_BY_OPERATOR" } } });
    } finally { store.close(); }
    const reopened = new GovernanceRolloutSqliteStore(path, now, projectId);
    try {
      const status = reopened.readStatus(projectId); expect(status).toMatchObject({ kind: "success", value: { mode: "NEEDS_HUMAN", eventVersion: 2 } });
      if (status.kind !== "success") throw new Error("reopened status required");
      expect(evaluateGovernancePilotDispatch({ projectId, status: status.value, candidate: dispatchCandidate("b".repeat(64), { occurredAt: "2026-07-20T18:00:00.000Z" }) })).toBe("NEEDS_HUMAN");
    } finally { reopened.close(); }
  });
});
