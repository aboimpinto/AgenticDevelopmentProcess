import { createServer } from "node:http";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchitectureDebtSqliteStore, createArchitectureDebtRecordId, type ArchitectureDebtLocation } from "@hepha/db";

import { computeGovernanceActionDigest } from "../src/governance-action-service.js";
import { openAuthoritativeReviewStore } from "../src/authoritative-review-integration.js";
import { handleGovernanceActionRoute } from "../src/governance-http-routes.js";
import type { GovernanceReadProvider, GovernanceReadProviderResult } from "../src/governance-read-service.js";

const project = { id: "project-feat-068", rootPath: "/safe/project" };
const roots: string[] = [];
const originalActor = process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
const originalRoles = process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
const originalSteward = process.env.HEPHA_ARCHITECTURE_STEWARD_ID;
const locations: readonly ArchitectureDebtLocation[] = [{ locationId: "location-068", relativePath: "apps/orchestrator/src/debt.ts", symbol: "evaluateDebt", ruleTags: ["architecture-debt"] }];
function sameDatabaseProvider(databasePath: string, rootPath: string): GovernanceReadProvider {
  return {
    load(currentProject) {
      const debtStore = new ArchitectureDebtSqliteStore(databasePath);
      try {
        const debts = debtStore.listArchitectureDebtByProject(currentProject.id);
        if (debts.kind !== "success") return { kind: "store_unavailable" };
        const reviewStore = openAuthoritativeReviewStore(rootPath, databasePath);
        if (!reviewStore) return { kind: "loaded", reviewModels: [], replans: [], debtAggregates: debts.values };
        try { return { kind: "loaded", reviewModels: [], replans: reviewStore.listReplanGovernanceForProject(currentProject.id), debtAggregates: debts.values }; } finally { reviewStore.close(); }
      } finally { debtStore.close(); }
    },
  };
}
type LoadedSnapshot = Extract<GovernanceReadProviderResult, { kind: "loaded" }>;
function modifiedSameDatabaseProvider(databasePath: string, rootPath: string, modify: (loaded: LoadedSnapshot) => GovernanceReadProviderResult): GovernanceReadProvider {
  const authoritative = sameDatabaseProvider(databasePath, rootPath);
  return { load(currentProject) {
    const loaded = authoritative.load(currentProject);
    return loaded.kind === "loaded" ? modify(loaded) : loaded;
  } };
}

afterEach(() => {
  if (originalActor === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID;
  else process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = originalActor;
  if (originalRoles === undefined) delete process.env.HEPHA_LOCAL_GOVERNANCE_ROLES;
  else process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = originalRoles;
  if (originalSteward === undefined) delete process.env.HEPHA_ARCHITECTURE_STEWARD_ID;
  else process.env.HEPHA_ARCHITECTURE_STEWARD_ID = originalSteward;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function hash(character: string): string { return character.repeat(64); }
function configureSteward(actor = "steward-068"): void {
  process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = actor;
  process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = "ARCHITECTURE_STEWARD";
  process.env.HEPHA_ARCHITECTURE_STEWARD_ID = actor;
}
function debtFixture() {
  const root = mkdtempSync(join(tmpdir(), "feat-068-actions-"));
  roots.push(root);
  const databasePath = join(root, "hepha.sqlite");
  const store = new ArchitectureDebtSqliteStore(databasePath);
  const rule = { ruleId: "architecture-debt", ruleVersion: "1", ruleHash: hash("a"), catalogHash: hash("b"), category: "architecture", sourceReference: ".hepha/architecture-rules.yaml" } as const;
  const operation = {
    kind: "CREATE_PENDING" as const, expectedVersion: 0 as const,
    recordId: createArchitectureDebtRecordId({ projectId: project.id, rule, architecturalBoundary: "orchestrator-policy", locations }), projectId: project.id,
    ownerId: "steward-068", rationale: "Historical debt requires steward triage.", risk: "Governance could drift without triage.", architecturalBoundary: "orchestrator-policy", priority: "P2" as const, prioritySource: "AUTO_PENDING_DEFAULT" as const,
    futureTouchTrigger: { triggerId: "touch-governance", name: "Touch governance boundary", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["evaluateDebt"], ruleTags: ["architecture-debt"] },
    discovery: { featureId: "feat-067", phaseNumber: 2, reviewGateId: "code-review", findingId: "finding-068", manifest: { artifactKind: "review_manifest" as const, artifactId: "manifest-068", contentHash: hash("c"), relativePath: "MemoryBank/manifest.json" }, observation: { artifactKind: "debt_observation" as const, artifactId: "observation-068", contentHash: hash("d"), relativePath: "MemoryBank/observation.json" }, currentFeatureImpact: "untouched_non_blocking" as const },
    rule, locations, createdAt: "2026-07-20T06:00:00.000Z",
  };
  const created = store.commitArchitectureDebtOperation(operation);
  if (created.kind !== "committed") throw new Error("Debt fixture must persist.");
  return { databasePath, store, aggregate: created.aggregate };
}

function confirmed(request: Record<string, unknown>): Record<string, unknown> {
  const { confirmation: _confirmation, ...withoutConfirmation } = request;
  const actionDigest = computeGovernanceActionDigest(withoutConfirmation);
  if (!actionDigest) throw new Error("Action fixture digest must compute.");
  return { ...withoutConfirmation, confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest } };
}
function confirmDebt(recordId: string, action = "CONFIRM", expectedVersion = 0): Record<string, unknown> {
  const payload = action === "CONFIRM"
    ? { ownerId: "steward-068", rationale: "Confirm this durable governance debt.", risk: "The debt needs named ownership.", architecturalBoundary: "orchestrator-policy", priority: "P1", futureTouchTrigger: { triggerId: "touch-governance", name: "Touch governance boundary", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["evaluateDebt"], ruleTags: ["architecture-debt"] } }
    : action === "CLOSE" ? { closureEvidence: "Close only after verified remediation." } : {};
  return confirmed({ schemaVersion: "hepha-governance-action/v1", actionId: "action-068", kind: "DEBT_TRIAGE", action, target: { recordId }, expectedVersion, reason: "The local steward records this governance action.", payload });
}

async function postAction(body: unknown, databasePath: string, selectedProject = project, actionProvider = sameDatabaseProvider(databasePath, selectedProject.rootPath)): Promise<Response> {
  const server = createServer((request, response) => {
    void handleGovernanceActionRoute(request, response, { findProject: (id) => id === selectedProject.id ? selectedProject : undefined, provider: actionProvider, databasePath, now: () => "2026-07-20T06:30:00.000Z" });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Action test server address unavailable.");
  try {
    return await fetch(`http://127.0.0.1:${address.port}/api/projects/${selectedProject.id}/governance/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function replanFixture(includeReplanRequest = true) {
  const root = mkdtempSync(join(tmpdir(), "feat-068-replan-actions-"));
  roots.push(root);
  mkdirSync(join(root, ".hepha"), { recursive: true });
  copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(root, ".hepha", "architecture-rules.yaml"));
  const databasePath = join(root, ".hepha", "hepha.sqlite");
  const localProject = { id: "project-action-068", rootPath: root };
  const scope = { projectId: localProject.id, featureId: "feat-068", phaseNumber: 3, reviewGateId: "code-review", defectClass: "governance-action" };
  const aggregateId = "replan-action-068";
  const store = openAuthoritativeReviewStore(root, databasePath);
  if (!store) throw new Error("Replan action fixture store must open.");
  const database = (store as unknown as { database: { prepare(sql: string): { run(...values: unknown[]): void } } }).database;
  const manifestHash = hash("e");
  database.prepare("insert into hepha_review_artifacts (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at) values (?, ?, 'review_manifest', 1, ?, ?, ?, ?, 'MemoryBank/Features/03_IN_PROGRESS/FEAT-068', 'artifacts/manifest.json', '{}', 'v1_validated_ingress', ?)").run(manifestHash, "manifest-action-068", scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, "2026-07-20T06:00:00.000Z");
  database.prepare("insert into hepha_review_artifacts (content_hash, artifact_id, artifact_kind, schema_version, project_id, feature_id, phase_number, review_gate_id, feature_root_path, artifact_relative_path, canonical_json, source_mode, ingested_at) values (?, ?, 'replan_plan', 1, ?, ?, ?, ?, 'MemoryBank/Features/03_IN_PROGRESS/FEAT-068', 'artifacts/plan.json', '{}', 'v1_validated_ingress', ?)").run(hash("f"), "plan-action-068", scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, "2026-07-20T06:00:00.000Z");
  database.prepare("insert into hepha_review_runs (review_run_id, manifest_hash, project_id, feature_id, phase_number, review_gate_id, manifest_result, agent_invocation_id, created_at) values ('run-action-068', ?, ?, ?, ?, ?, 'NEEDS_CHANGES', 'review-agent-068', ?)").run(manifestHash, scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, "2026-07-20T06:00:00.000Z");
  database.prepare("insert into hepha_review_findings (review_run_id, finding_id, project_id, feature_id, phase_number, review_gate_id, disposition, claim_type, severity, defect_class, summary) values ('run-action-068', 'finding-action-068', ?, ?, ?, ?, 'SCOPE_EXPANSION', 'architecture', 'required', ?, 'Bounded action.')").run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, scope.defectClass);
  database.prepare("insert into hepha_review_finding_observations (observation_id, review_run_id, finding_id, surface_json, remediation_items_json, test_matrix_json, created_at) values ('observation-action-068', 'run-action-068', 'finding-action-068', '[]', '[]', '[]', ?)").run("2026-07-20T06:00:00.000Z");
  database.prepare("insert into hepha_review_remediation_cycles (cycle_id, project_id, feature_id, phase_number, review_gate_id, basis_manifest_hash, cycle_state, created_at) values ('cycle-action-068', ?, ?, ?, ?, ?, 'REVIEW_PENDING', ?)").run(scope.projectId, scope.featureId, scope.phaseNumber, scope.reviewGateId, manifestHash, "2026-07-20T06:00:00.000Z");
  if (!includeReplanRequest) {
    store.commitReplanGovernanceOperation({ kind: "OBSERVATION", records: { observation: { ...scope, aggregateId, observationEventId: "scope-observation-action-068", observationKind: "FINDING_EXHAUSTIVENESS", triggerManifestHash: manifestHash, basisManifestHash: manifestHash, findingObservationId: "observation-action-068", createdAt: "2026-07-20T06:00:00.000Z" } } });
  } else {
    store.commitReplanGovernanceOperation({ kind: "THRESHOLD_MANIFESTATION", records: { observation: { ...scope, aggregateId, observationEventId: "threshold-action-068", observationKind: "POST_FIX_MANIFESTATION", triggerManifestHash: manifestHash, basisManifestHash: manifestHash, remediationCycleId: "cycle-action-068", createdAt: "2026-07-20T06:00:00.000Z" }, transition: { ...scope, aggregateId, transitionId: "threshold-transition-068", fromState: "NORMAL_REMEDIATION", toState: "REMEDIATION_REPLAN_REQUIRED", reasonCode: "threshold-reached", triggerRecordId: "threshold-action-068", expectedVersion: 0, resultingVersion: 1, transitionedAt: "2026-07-20T06:00:00.000Z" } } });
    store.commitReplanGovernanceOperation({ kind: "PLAN_REQUEST", records: { request: { ...scope, aggregateId, requestId: "request-action-068", triggerEventId: "threshold-action-068", planHash: hash("f"), planVersion: 1, proposalAuthorActor: "review-agent-068", producerInvocationId: "review-invocation-068", policyId: "replan-governance-v1", policyVersion: 1, requestedAt: "2026-07-20T06:00:00.000Z" }, transition: { ...scope, aggregateId, transitionId: "request-transition-068", fromState: "REMEDIATION_REPLAN_REQUIRED", toState: "REPLAN_PENDING_APPROVAL", reasonCode: "request-created", triggerRecordId: "request-action-068", expectedVersion: 1, resultingVersion: 2, transitionedAt: "2026-07-20T06:00:00.000Z" } } });
  }
  store.close();
  return { databasePath, localProject, scope, aggregateId };
}
function scopeAction(fixture: ReturnType<typeof replanFixture>): Record<string, unknown> {
  return confirmed({ schemaVersion: "hepha-governance-action/v1", actionId: "scope-action-068", kind: "SCOPE_EXPANSION_DECISION", action: "ACCEPT_SCOPE_EXPANSION", target: { aggregateId: fixture.aggregateId, featureId: fixture.scope.featureId, phaseNumber: fixture.scope.phaseNumber, reviewGateId: fixture.scope.reviewGateId, defectClass: fixture.scope.defectClass, findingObservationId: "observation-action-068" }, expectedVersion: 0, reason: "The feature owner accepts the bounded expansion.", payload: {} });
}
function replanAction(fixture: ReturnType<typeof replanFixture>): Record<string, unknown> {
  return confirmed({ schemaVersion: "hepha-governance-action/v1", actionId: "replan-action-068", kind: "REPLAN_DECISION", action: "APPROVE_REPLAN", target: { aggregateId: fixture.aggregateId, featureId: fixture.scope.featureId, phaseNumber: fixture.scope.phaseNumber, reviewGateId: fixture.scope.reviewGateId, defectClass: fixture.scope.defectClass, requestId: "request-action-068", planHash: hash("f"), planVersion: 1 }, expectedVersion: 2, reason: "The architecture steward approves the bounded replan.", payload: {} });
}

describe("FEAT-068 public governance action routes", () => {
  it("E013-GD-003 records a confirmed current debt-triage action through the public POST route", async () => {
    configureSteward();
    const { databasePath, store, aggregate } = debtFixture();
    try {
      const response = await postAction(confirmDebt(aggregate.recordId), databasePath);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_recorded", receipt: { projectId: project.id, kind: "DEBT_TRIAGE", action: "CONFIRM", expectedVersion: 0, resultingVersion: 1, actorId: "steward-068", authorizedRole: "ARCHITECTURE_STEWARD", recordedAt: "2026-07-20T06:30:00.000Z" }, refreshed: { projectId: project.id, architectureDebt: [{ recordId: aggregate.recordId, eventVersion: 1, state: "CONFIRMED" }] } });
      expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toMatchObject({ state: "CONFIRMED", eventVersion: 1 });
    } finally { store.close(); }
  });

  it("E013-GD-003 records confirmed scope-expansion and replan decisions through their real provider boundaries", async () => {
    const scopeFixture = replanFixture(false);
    process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = "feature-owner-068";
    process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = "FEATURE_OWNER";
    const scopeResponse = await postAction(scopeAction(scopeFixture), scopeFixture.databasePath, scopeFixture.localProject);
    expect(scopeResponse.status).toBe(200);
    await expect(scopeResponse.json()).resolves.toMatchObject({ kind: "governance_action_recorded", receipt: { kind: "SCOPE_EXPANSION_DECISION", action: "ACCEPT_SCOPE_EXPANSION", resultingVersion: 1 }, refreshed: { replans: [{ aggregateId: scopeFixture.aggregateId, eventVersion: 1, scopeExpansionDecisions: [{ findingObservationId: "observation-action-068", outcome: "ACCEPT", resultingVersion: 1 }] }] } });

    const replanFixtureValue = replanFixture();
    configureSteward("steward-068");
    const replanResponse = await postAction(replanAction(replanFixtureValue), replanFixtureValue.databasePath, replanFixtureValue.localProject);
    expect(replanResponse.status).toBe(200);
    await expect(replanResponse.json()).resolves.toMatchObject({ kind: "governance_action_recorded", receipt: { kind: "REPLAN_DECISION", action: "APPROVE_REPLAN", resultingVersion: 3 }, refreshed: { replans: [{ aggregateId: replanFixtureValue.aggregateId, eventVersion: 3, replanDecisions: [{ requestId: "request-action-068", planHash: hash("f"), planVersion: 1, outcome: "APPROVE", resultingVersion: 3 }] }] } });
  });

  it("E013-GD-004 refuses a self-conflicting replan before provider mutation", async () => {
    const fixture = replanFixture();
    configureSteward("review-agent-068");
    const response = await postAction(replanAction(fixture), fixture.databasePath, fixture.localProject);
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "SELF_CONFLICT", currentVersion: 2 });
    const store = openAuthoritativeReviewStore(fixture.localProject.rootPath, fixture.databasePath);
    try { expect(store?.getReplanGovernanceAggregate(fixture.scope, fixture.aggregateId)).toMatchObject({ eventVersion: 2, state: "REPLAN_PENDING_APPROVAL" }); } finally { store?.close(); }
  });

  it("E013-GD-004 refuses non-loopback before reading a body or mutating a provider", async () => {
    const { databasePath, store, aggregate } = debtFixture();
    const writeHead = vi.fn();
    const end = vi.fn();
    const request = Object.assign(Readable.from([]), { method: "POST", url: `/api/projects/${project.id}/governance/actions`, headers: { host: "localhost" }, socket: { remoteAddress: "192.0.2.44" } });
    try {
      await expect(handleGovernanceActionRoute(request as never, { writeHead, end } as never, { findProject: (id) => id === project.id ? project : undefined, provider: sameDatabaseProvider(databasePath, project.rootPath), databasePath })).resolves.toBe(true);
      expect(writeHead).toHaveBeenCalledWith(403, expect.any(Object));
      expect(end).toHaveBeenCalledWith(expect.stringContaining("NON_LOOPBACK_REQUEST"));
      expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toEqual(aggregate);
    } finally { store.close(); }
  });

  it("E013-GD-004 refuses malformed, unconfirmed, caller-authority, stale, foreign, provider-refused, and persistence-failed requests without mutation", async () => {
    configureSteward();
    for (const { build, code } of [
      { build: (_recordId: string) => ({ schemaVersion: "hepha-governance-action/v1" }), code: "INVALID_REQUEST" },
      { build: (recordId: string) => { const value = confirmDebt(recordId); delete value.confirmation; return value; }, code: "CONFIRMATION_REQUIRED" },
      { build: (recordId: string) => ({ ...confirmDebt(recordId), confirmation: { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: hash("0") } }), code: "CONFIRMATION_MISMATCH" },
      { build: (recordId: string) => { const value = confirmDebt(recordId); delete value.reason; return value; }, code: "INVALID_REQUEST" },
      { build: (recordId: string) => ({ ...confirmDebt(recordId), actorId: "forged-operator" }), code: "INVALID_REQUEST" },
      { build: (recordId: string) => confirmDebt(recordId, "CONFIRM", 1), code: "STALE_VERSION" },
      { build: (_recordId: string) => confirmDebt(`ARCH-DEBT-${"f".repeat(32)}`), code: "FOREIGN_TARGET" },
      { build: (recordId: string) => confirmDebt(recordId, "CLOSE"), code: "PROVIDER_REFUSED" },
    ]) {
      const { databasePath, store, aggregate } = debtFixture();
      try {
        const before = store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId });
        const response = await postAction(build(aggregate.recordId), databasePath);
        expect(response.status).toBeGreaterThanOrEqual(400);
        await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code });
        expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toEqual(before);
      } finally { store.close(); }
    }
    const { databasePath, store, aggregate } = debtFixture();
    try {
      const response = await postAction(confirmDebt(aggregate.recordId), join(databasePath, "missing", "hepha.sqlite"));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
      expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toEqual(aggregate);
    } finally { store.close(); }
  });

  it("fails closed before scope and replan writes when their same-database refreshed snapshot is unavailable", async () => {
    const snapshotCases: readonly [string, (loaded: LoadedSnapshot) => GovernanceReadProviderResult][] = [
      ["omitted target", (loaded) => ({ ...loaded, replans: [] })],
      ["wrong snapshot version", (loaded) => ({ ...loaded, replans: loaded.replans.map((item) => ({ ...(item as Record<string, unknown>), eventVersion: 99 })) })],
      ["malformed envelope", (loaded) => ({ ...loaded, replans: [{}] })],
      ["unsafe projection", (loaded) => ({ ...loaded, replans: loaded.replans.map((item) => ({ ...(item as Record<string, unknown>), scope: { ...((item as { scope: Record<string, unknown> }).scope), defectClass: "<script>unsafe</script>" } })) })],
    ];
    for (const [label, modify] of snapshotCases) {
      const scopeFixture = replanFixture(false);
      process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = "feature-owner-068";
      process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = "FEATURE_OWNER";
      const scopeStore = openAuthoritativeReviewStore(scopeFixture.localProject.rootPath, scopeFixture.databasePath);
      try {
        const before = JSON.stringify(scopeStore?.getReplanGovernanceAggregate(scopeFixture.scope, scopeFixture.aggregateId));
        const response = await postAction(scopeAction(scopeFixture), scopeFixture.databasePath, scopeFixture.localProject, modifiedSameDatabaseProvider(scopeFixture.databasePath, scopeFixture.localProject.rootPath, modify));
        expect(response.status, label).toBe(503);
        await expect(response.json(), label).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(scopeStore?.getReplanGovernanceAggregate(scopeFixture.scope, scopeFixture.aggregateId)), label).toBe(before);
      } finally { scopeStore?.close(); }

      const replanFixtureValue = replanFixture();
      configureSteward();
      const replanStore = openAuthoritativeReviewStore(replanFixtureValue.localProject.rootPath, replanFixtureValue.databasePath);
      try {
        const before = JSON.stringify(replanStore?.getReplanGovernanceAggregate(replanFixtureValue.scope, replanFixtureValue.aggregateId));
        const response = await postAction(replanAction(replanFixtureValue), replanFixtureValue.databasePath, replanFixtureValue.localProject, modifiedSameDatabaseProvider(replanFixtureValue.databasePath, replanFixtureValue.localProject.rootPath, modify));
        expect(response.status, label).toBe(503);
        await expect(response.json(), label).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(replanStore?.getReplanGovernanceAggregate(replanFixtureValue.scope, replanFixtureValue.aggregateId)), label).toBe(before);
      } finally { replanStore?.close(); }
    }
    for (const unavailable of [
      { load: () => ({ kind: "store_unavailable" as const }) },
      { load: () => { throw new Error("unavailable"); } },
    ] satisfies GovernanceReadProvider[]) {
      const scopeFixture = replanFixture(false);
      process.env.HEPHA_LOCAL_GOVERNANCE_ACTOR_ID = "feature-owner-068";
      process.env.HEPHA_LOCAL_GOVERNANCE_ROLES = "FEATURE_OWNER";
      const scopeStore = openAuthoritativeReviewStore(scopeFixture.localProject.rootPath, scopeFixture.databasePath);
      try {
        const before = JSON.stringify(scopeStore?.getReplanGovernanceAggregate(scopeFixture.scope, scopeFixture.aggregateId));
        const response = await postAction(scopeAction(scopeFixture), scopeFixture.databasePath, scopeFixture.localProject, unavailable);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(scopeStore?.getReplanGovernanceAggregate(scopeFixture.scope, scopeFixture.aggregateId))).toBe(before);
      } finally { scopeStore?.close(); }

      const replanFixtureValue = replanFixture();
      configureSteward();
      const replanStore = openAuthoritativeReviewStore(replanFixtureValue.localProject.rootPath, replanFixtureValue.databasePath);
      try {
        const before = JSON.stringify(replanStore?.getReplanGovernanceAggregate(replanFixtureValue.scope, replanFixtureValue.aggregateId));
        const response = await postAction(replanAction(replanFixtureValue), replanFixtureValue.databasePath, replanFixtureValue.localProject, unavailable);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(replanStore?.getReplanGovernanceAggregate(replanFixtureValue.scope, replanFixtureValue.aggregateId))).toBe(before);
      } finally { replanStore?.close(); }
    }
  });

  it("requires every malformed or absent confirmation before authority or provider use", async () => {
    configureSteward();
    const unreachableProvider: GovernanceReadProvider = { load: () => { throw new Error("confirmation must reject before provider use"); } };
    for (const mutate of [
      (value: Record<string, unknown>) => { delete value.confirmation; },
      (value: Record<string, unknown>) => { value.confirmation = null; },
      (value: Record<string, unknown>) => { value.confirmation = "confirm"; },
      (value: Record<string, unknown>) => { value.confirmation = {}; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION" }; },
      (value: Record<string, unknown>) => { value.confirmation = { actionDigest: hash("a") }; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: hash("a"), extra: true }; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "WRONG", actionDigest: hash("a") }; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: hash("A") }; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: "abc" }; },
      (value: Record<string, unknown>) => { value.confirmation = { statement: "I_CONFIRM_THIS_GOVERNANCE_ACTION", actionDigest: `g${"a".repeat(63)}` }; },
    ]) {
      const { databasePath, store, aggregate } = debtFixture();
      try {
        const before = store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId });
        const request = confirmDebt(aggregate.recordId); mutate(request);
        const response = await postAction(request, databasePath, project, unreachableProvider);
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "CONFIRMATION_REQUIRED" });
        expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toEqual(before);
      } finally { store.close(); }
    }
  });

  it("fails closed before a debt write when the authoritative refreshed snapshot is unavailable or unsafe", async () => {
    configureSteward();
    const snapshotCases: readonly [string, (loaded: LoadedSnapshot) => GovernanceReadProviderResult][] = [
      ["omitted target", (loaded) => ({ ...loaded, debtAggregates: [] })],
      ["wrong snapshot version", (loaded) => ({ ...loaded, debtAggregates: loaded.debtAggregates.map((item) => ({ ...(item as Record<string, unknown>), eventVersion: 99 })) })],
      ["malformed envelope", (loaded) => ({ ...loaded, debtAggregates: [{}] })],
      ["unsafe projection", (loaded) => ({ ...loaded, debtAggregates: loaded.debtAggregates.map((item) => ({ ...(item as Record<string, unknown>), rationale: "<script>unsafe</script>" })) })],
    ];
    for (const [label, modify] of snapshotCases) {
      const { databasePath, store, aggregate } = debtFixture();
      try {
        const before = JSON.stringify(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId }));
        const response = await postAction(confirmDebt(aggregate.recordId), databasePath, project, modifiedSameDatabaseProvider(databasePath, project.rootPath, modify));
        expect(response.status, label).toBe(503);
        await expect(response.json(), label).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })), label).toBe(before);
      } finally { store.close(); }
    }
    for (const actionProvider of [
      { load: () => ({ kind: "store_unavailable" as const }) },
      { load: () => { throw new Error("unavailable"); } },
    ] satisfies GovernanceReadProvider[]) {
      const { databasePath, store, aggregate } = debtFixture();
      try {
        const before = JSON.stringify(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId }));
        const response = await postAction(confirmDebt(aggregate.recordId), databasePath, project, actionProvider);
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "PERSISTENCE_FAILED" });
        expect(JSON.stringify(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId }))).toBe(before);
      } finally { store.close(); }
    }
  });

  it("requires the designated local architecture steward rather than accepting only a caller-independent role", async () => {
    configureSteward();
    process.env.HEPHA_ARCHITECTURE_STEWARD_ID = "different-steward";
    const { databasePath, store, aggregate } = debtFixture();
    try {
      const response = await postAction(confirmDebt(aggregate.recordId), databasePath);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ kind: "governance_action_refusal", code: "AUTHORITY_UNAVAILABLE" });
      expect(store.getArchitectureDebtAggregate({ projectId: project.id, recordId: aggregate.recordId })).toEqual(aggregate);
    } finally { store.close(); }
  });
});
