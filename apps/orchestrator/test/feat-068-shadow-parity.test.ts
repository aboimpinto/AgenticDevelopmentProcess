import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { GovernanceRolloutSqliteStore } from "@hepha/db";
import type { GovernanceDashboardReadV1 } from "@hepha/shared";
import { handleGovernanceReadRoute } from "../src/governance-http-routes.js";
import { canonicalizeGovernanceParityV1, readGovernanceRolloutStatus, recordGovernanceParity } from "../src/governance-parity-service.js";

const cleanup: string[] = [];
afterEach(() => { while (cleanup.length) rmSync(cleanup.pop()!, { force: true, recursive: true }); });
const project = { id: "project-068", rootPath: "/safe/project" };
function path(): string { const directory = mkdtempSync(join(tmpdir(), "hepha-parity-")); cleanup.push(directory); return join(directory, "hepha.sqlite"); }
function dashboard(): GovernanceDashboardReadV1 {
  const counts = [{ key: "Z", count: 1 }, { key: "A", count: 2 }] as any;
  return { schemaVersion: "hepha-governance-dashboard/v1", projectId: project.id, remediations: [], replans: [{ aggregateId: "aggregate-1", featureId: "feat-068", phaseNumber: 5, reviewGateId: "gate-1", defectClass: "BOUNDARY", state: "REPLAN_PENDING_APPROVAL", eventVersion: 2, recurrence: { postFixManifestations: 1, acceptedScopeExpansions: 0 }, currentRequest: { requestId: "request-1", planHash: "a".repeat(64), planVersion: 1, requestedAt: "2026-07-20T14:00:00.000Z" }, scopeExpansionDecisions: [], replanDecisions: [], dispatch: null, summary: { observations: 1, requests: 1, decisions: 0, dispatchAttempts: 0, reviewAssessments: 1 }, availableActions: ["APPROVE_REPLAN"] }], architectureDebt: [], queue: [{ itemId: "replan:aggregate-1", itemKind: "REPLAN", targetId: "aggregate-1", featureId: "feat-068", state: "REPLAN_PENDING_APPROVAL", currentVersion: 2, requiresAction: true, urgency: "REPLAN_APPROVAL", summaryCode: "REPLAN_APPROVAL", availableActions: ["APPROVE_REPLAN"] }], metrics: { reviewResults: counts, gateStates: [], cycleStates: [], findingDispositions: [], ruleReferences: [], recoveryStopReasons: [], replanStates: counts, debtStates: [], debtPriorities: [], scopeDecisionOutcomes: [], replanDecisionOutcomes: [], futureTouchDecisionKinds: [], dispatchOutcomes: [], shadowOutcomes: [], pilotOutcomes: [], reviewRuns: 0 as any, openRemediationCycles: 0 as any, replanAggregates: 1 as any, architectureDebtRecords: 0 as any, actionableQueueItems: 1 as any, postFixManifestations: 1 as any, acceptedScopeExpansions: 0 as any }, rollout: { mode: "DISABLED", eventVersion: 0, parity: null, migration: null, pilot: null } };
}
function pilotEvents(databasePath: string): unknown[] { const db = new DatabaseSync(databasePath); try { return db.prepare("select project_id,event_version,pilot_id,event_kind,state,payload_json,occurred_at from hepha_governance_pilot_events order by project_id,event_version").all(); } finally { db.close(); } }
function foreignMigrationReadBackHash(auditId: string): string {
  const tables = ["hepha_governance_rollout_schema_migrations", "hepha_governance_parity_receipts", "hepha_governance_migration_audit", "hepha_governance_pilot_events"];
  const triggers = tables.flatMap((table) => [`trg_${table}_no_update`, `trg_${table}_no_delete`]).sort();
  return createHash("sha256").update(JSON.stringify({ auditId, migrationCount: 1, migrationVersions: [1], tables, triggers, version: 1 }), "utf8").digest("hex");
}
async function rolloutStatusResponse(databasePath: string): Promise<Response> {
  const server = createServer((request, response) => { void handleGovernanceReadRoute(request, response, { findProject: (id) => id === project.id ? project : undefined, provider: { load: () => ({ kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }) }, databasePath }); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("test server unavailable");
  try { return await fetch(`http://127.0.0.1:${address.port}/api/projects/${project.id}/governance/rollout-status`); } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

describe("FEAT-068 shadow parity and rollout migration", () => {
  it("E013-GD-006 canonicalizes reordered equivalent V1 projections and records a safe MATCH without enforcement mutation", () => {
    const first = dashboard(); const second = dashboard(); second.metrics.reviewResults = [...second.metrics.reviewResults].reverse();
    const firstProjection = canonicalizeGovernanceParityV1(first)!;
    const secondProjection = canonicalizeGovernanceParityV1(second)!;
    expect(firstProjection).toMatchObject(secondProjection);
    expect(firstProjection.projection).toMatchObject({ schemaVersion: "hepha-governance-parity/v1", projectId: project.id, sourceVersionHash: firstProjection.sourceVersionHash });
    expect(Object.keys(firstProjection.projection).sort()).toEqual(["architectureDebt", "metrics", "projectId", "queue", "remediations", "replans", "schemaVersion", "sourceVersionHash"]);
    expect(firstProjection.bytes).toContain("hepha-governance-parity/v1");
    expect(firstProjection.bytes).not.toContain("hepha-governance-dashboard/v1");
    expect(firstProjection.projection).not.toHaveProperty("rollout");
    const databasePath = path();
    const result = recordGovernanceParity({ databasePath, projectId: project.id, authoritative: first, dashboard: second, now: () => "2026-07-20T14:30:00.000Z" });
    expect(result).toMatchObject({ kind: "governance_parity_recorded", receipt: { result: "MATCH", differenceCategories: [] } });
    const db = new DatabaseSync(databasePath);
    expect((db.prepare("select count(*) as count from hepha_governance_pilot_events").get() as { count: number }).count).toBe(0);
    expect((db.prepare("select count(*) as count from hepha_governance_parity_receipts").get() as { count: number }).count).toBe(1);
    db.close();
  });

  it("E013-GD-006 persists only safe mismatch categories and refuses unsafe or foreign models", () => {
    const databasePath = path(); const authoritative = dashboard(); const unequal = dashboard(); unequal.queue[0]!.summaryCode = "QUEUE_DIFFERENT"; unequal.metrics.reviewRuns = 1 as any;
    const mismatch = recordGovernanceParity({ databasePath, projectId: project.id, authoritative, dashboard: unequal, now: () => "2026-07-20T14:30:00.000Z" });
    expect(mismatch).toMatchObject({ kind: "governance_parity_recorded", receipt: { result: "MISMATCH", differenceCategories: ["QUEUE", "METRICS"] } });
    expect(JSON.stringify(mismatch)).not.toMatch(/databasePath|safe\/project|secret|raw/i);
    const beforeRefusals = pilotEvents(databasePath);
    expect(recordGovernanceParity({ databasePath, projectId: "foreign-project", authoritative, dashboard: unequal, now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "FOREIGN_PROJECTION" });
    const unsafe = dashboard() as any; unsafe.metrics.reviewResults[0].key = "secret=do-not-store";
    expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative, dashboard: unsafe, now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "INVALID_PROJECTION" });
    expect(pilotEvents(databasePath)).toEqual(beforeRefusals);
  });

  it("E013-GD-006 rejects missing, secret-bearing, and absolute-path projections without appending parity or pilot data", () => {
    const databasePath = path(); const authoritative = dashboard();
    expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative, dashboard: undefined, now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "INVALID_PROJECTION" });
    const secret = dashboard() as any; secret.metrics.reviewResults[0].key = "token=not-safe";
    expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative, dashboard: secret, now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "INVALID_PROJECTION" });
    const absolutePath = dashboard() as any; absolutePath.queue[0].summaryCode = "/private/unsafe";
    expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative, dashboard: absolutePath, now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "INVALID_PROJECTION" });
    expect(existsSync(databasePath)).toBe(false);
  });

  it("E013-GD-007 fails closed for a parity write/read-back failure and leaves enforcement data byte-for-byte unchanged", () => {
    const databasePath = path(); readGovernanceRolloutStatus({ databasePath, projectId: project.id }); const before = pilotEvents(databasePath);
    const db = new DatabaseSync(databasePath); db.exec("create trigger fail_parity_write before insert on hepha_governance_parity_receipts begin select raise(abort, 'injected failure'); end;"); db.close();
    expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative: dashboard(), dashboard: dashboard(), now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_refusal", code: "PERSISTENCE_FAILED" });
    expect(pilotEvents(databasePath)).toEqual(before);
  });

  it("E013-GD-007 rejects a corrupt persisted receipt through the public status route without exposing unsafe data", async () => {
    const databasePath = path(); expect(recordGovernanceParity({ databasePath, projectId: project.id, authoritative: dashboard(), dashboard: dashboard(), now: () => "2026-07-20T14:30:00.000Z" })).toMatchObject({ kind: "governance_parity_recorded" }); const before = pilotEvents(databasePath);
    const db = new DatabaseSync(databasePath); db.exec("drop trigger trg_hepha_governance_parity_receipts_no_update; update hepha_governance_parity_receipts set difference_categories_json='[\"QUEUE\",\"METRICS\"]';"); db.close();
    const response = await rolloutStatusResponse(databasePath); expect(response.status).toBe(503); const body = await response.json(); expect(body).toMatchObject({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE" }); expect(JSON.stringify(body)).not.toMatch(/safe\/project|hepha\.sqlite|QUEUE|METRICS/i);
    expect(pilotEvents(databasePath)).toEqual(before);
  });

  it("E013-GD-007 applies, reopens, read-backs, and exposes a public disabled rollout status", async () => {
    const databasePath = path();
    const first = readGovernanceRolloutStatus({ databasePath, projectId: project.id });
    expect(first).toMatchObject({ kind: "governance_rollout_status", status: { mode: "DISABLED", eventVersion: 0, parity: null, migration: { schemaArea: "GOVERNANCE_ROLLOUT", outcome: "APPLIED", readBackHash: expect.stringMatching(/^[a-f0-9]{64}$/) } } });
    const reopened = readGovernanceRolloutStatus({ databasePath, projectId: project.id });
    expect(reopened).toMatchObject({ kind: "governance_rollout_status", status: { mode: "DISABLED", eventVersion: 0, migration: { outcome: "ALREADY_CURRENT" } } });
    const db = new DatabaseSync(databasePath); expect((db.prepare("select count(*) as count from hepha_governance_rollout_schema_migrations").get() as { count: number }).count).toBe(1); db.close(); const before = pilotEvents(databasePath);
    const response = await rolloutStatusResponse(databasePath);
    expect(response.status).toBe(200);
    const body = await response.json() as { kind: string; status: Record<string, unknown> };
    expect(body.kind).toBe("governance_rollout_status");
    expect(Object.keys(body.status).sort()).toEqual(["eventVersion", "migration", "mode", "parity", "pilot"]);
    expect(Object.keys(body.status.migration as Record<string, unknown>).sort()).toEqual(["auditId", "completedAt", "fromVersion", "outcome", "readBackHash", "schemaArea", "toVersion"]);
    expect(body.status).toMatchObject({ mode: "DISABLED", eventVersion: 0, pilot: null });
    expect(JSON.stringify(body)).not.toMatch(/projectId|startedAt|safeCode|differenceCount/i);
    expect(pilotEvents(databasePath)).toEqual(before);
  });

  it("E013-GD-007 refuses a foreign rollout-store project rather than substituting its migration audit", async () => {
    for (const kind of ["parity", "migration"] as const) {
      const databasePath = path();
      const initial = new GovernanceRolloutSqliteStore(databasePath, () => "2026-07-20T14:30:00.000Z", project.id);
      initial.close();
      const db = new DatabaseSync(databasePath);
      if (kind === "parity") {
        db.prepare("insert into hepha_governance_parity_receipts(receipt_id,project_id,projection_schema,source_version_hash,authoritative_hash,dashboard_hash,result,difference_categories_json,difference_count,compared_at,valid_until) values (?,?,?,?,?,?,?,?,?,?,?)").run("foreign-parity", "foreign-project", "hepha-governance-parity/v1", "a".repeat(64), "b".repeat(64), "c".repeat(64), "MATCH", "[]", 0, "2026-07-20T14:31:00.000Z", "2026-07-20T15:31:00.000Z");
      } else {
        const auditId = "foreign-audit";
        db.prepare("insert into hepha_governance_migration_audit(audit_id,project_id,schema_area,from_version,to_version,outcome,started_at,completed_at,read_back_hash,safe_code) values (?,?,?,?,?,?,?,?,?,?)").run(auditId, "foreign-project", "GOVERNANCE_ROLLOUT", 1, 1, "ALREADY_CURRENT", "2026-07-20T14:31:00.000Z", "2026-07-20T14:31:00.000Z", foreignMigrationReadBackHash(auditId), null);
      }
      const beforeAudit = db.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all();
      db.close();
      const beforePilot = pilotEvents(databasePath);
      const response = await rolloutStatusResponse(databasePath);
      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body).toEqual({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE", message: "Governance rollout storage is unavailable." });
      expect(JSON.stringify(body)).not.toMatch(/foreign-project|foreign-parity|foreign-audit/i);
      const after = new DatabaseSync(databasePath);
      expect(after.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all()).toEqual(beforeAudit);
      after.close();
      expect(pilotEvents(databasePath)).toEqual(beforePilot);
    }
  });

  it("E013-GD-007 rejects invalid ledger and incomplete-table current schemas instead of repairing or appending success evidence", () => {
    for (const corrupt of [
      (db: DatabaseSync) => { db.exec("drop trigger trg_hepha_governance_rollout_schema_migrations_no_update; update hepha_governance_rollout_schema_migrations set version=2;"); },
      (db: DatabaseSync) => { db.exec("drop table hepha_governance_parity_receipts;"); },
    ]) {
      const databasePath = path();
      const initial = new GovernanceRolloutSqliteStore(databasePath, () => "2026-07-20T14:30:00.000Z", project.id);
      initial.close();
      const db = new DatabaseSync(databasePath);
      const beforeAudit = db.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all();
      const beforePilot = pilotEvents(databasePath);
      corrupt(db); db.close();
      expect(readGovernanceRolloutStatus({ databasePath, projectId: project.id })).toMatchObject({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE" });
      const after = new DatabaseSync(databasePath);
      expect(after.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all()).toEqual(beforeAudit);
      after.close();
      expect(pilotEvents(databasePath)).toEqual(beforePilot);
    }
  });

  it("E013-GD-007 rejects missing append-only protection and audit read-back mismatch without a success audit", () => {
    for (const corrupt of [
      (db: DatabaseSync) => { db.exec("drop trigger trg_hepha_governance_migration_audit_no_delete;"); },
      (db: DatabaseSync) => {
        db.exec("drop trigger trg_hepha_governance_migration_audit_no_update; update hepha_governance_migration_audit set read_back_hash='0000000000000000000000000000000000000000000000000000000000000000'; create trigger trg_hepha_governance_migration_audit_no_update before update on hepha_governance_migration_audit begin select raise(abort, 'append-only'); end;");
      },
    ]) {
      const databasePath = path();
      const initial = new GovernanceRolloutSqliteStore(databasePath, () => "2026-07-20T14:30:00.000Z", project.id);
      initial.close();
      const db = new DatabaseSync(databasePath);
      const beforeAudit = db.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all();
      const beforePilot = pilotEvents(databasePath);
      corrupt(db); db.close();
      expect(readGovernanceRolloutStatus({ databasePath, projectId: project.id })).toMatchObject({ kind: "governance_rollout_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE" });
      const after = new DatabaseSync(databasePath);
      expect(after.prepare("select audit_id,project_id,outcome from hepha_governance_migration_audit order by audit_id").all()).toEqual(beforeAudit);
      after.close();
      expect(pilotEvents(databasePath)).toEqual(beforePilot);
    }
  });
});
