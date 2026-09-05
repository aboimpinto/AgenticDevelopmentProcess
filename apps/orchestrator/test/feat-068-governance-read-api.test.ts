import { createServer } from "node:http";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { StoredReplanGovernanceAggregate } from "@hepha/db";

import { handleGovernanceReadRoute } from "../src/governance-http-routes.js";
import { createSqliteGovernanceReadProvider, readGovernanceDashboard, type GovernanceReadProvider } from "../src/governance-read-service.js";
import { ingestAndRenderAuthoritativeReview, ingestAndRenderAuthoritativeReviewSuccessor, openAuthoritativeReviewStore } from "../src/authoritative-review-integration.js";
import { loadStrictCatalogForReview, resolveStrictActiveRule, validateReviewContractArtifact } from "../src/review-contract-integration-adapter.js";
import { buildValidFinding, buildValidManifest, buildValidRemediationResponse, buildValidVerificationReceipt } from "../src/review-contract-types.js";

const project = { id: "project-feat-068", rootPath: "/safe/project" };
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => { while (cleanup.length) await cleanup.pop()!(); });

function replan(aggregateId: string, overrides: Partial<StoredReplanGovernanceAggregate> = {}): StoredReplanGovernanceAggregate {
  return {
    scope: { projectId: project.id, featureId: "feat-068", phaseNumber: 2, reviewGateId: "code-review", defectClass: "governance-read" },
    aggregateId, eventVersion: 0, state: "NORMAL_REMEDIATION", observations: [], requests: [], scopeExpansionDecisions: [], decisions: [], transitions: [], dispatchAttempts: [], reviewAssessments: [], ...overrides,
  };
}
function debt(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    recordId: `ARCH-DEBT-${"d".repeat(32)}`,
    projectId: project.id,
    eventVersion: 0,
    state: "PENDING_TRIAGE",
    ownerId: "steward-068",
    rationale: "The historical boundary remains governed debt.",
    risk: "The boundary can drift until the named trigger is reviewed.",
    architecturalBoundary: "rule-scope-orchestrator",
    priority: "P2",
    prioritySource: "AUTO_PENDING_DEFAULT",
    futureTouchTrigger: { triggerId: "touch-observed-surface", name: "Touch observed surface", paths: ["apps/orchestrator/src/debt.ts"], symbols: ["evaluateDebt"], ruleTags: ["architecture-debt"] },
    discovery: {
      featureId: "feat-067", phaseNumber: 2, reviewGateId: "code-review", findingId: "finding-067",
      manifest: { artifactKind: "review_manifest", artifactId: "manifest-067", contentHash: "a".repeat(64), relativePath: "artifacts/manifest-067.json" },
      observation: { artifactKind: "debt_observation", artifactId: "observation-067", contentHash: "b".repeat(64), relativePath: "artifacts/observation-067.json" },
      currentFeatureImpact: "untouched_non_blocking",
    },
    rule: { ruleId: "architecture-debt", ruleVersion: "1", ruleHash: "c".repeat(64), catalogHash: "d".repeat(64), category: "architecture", sourceReference: ".hepha/architecture-rules.yaml" },
    locations: [{ locationId: "location-068", relativePath: "apps/orchestrator/src/debt.ts", symbol: "evaluateDebt", ruleTags: ["architecture-debt"] }],
    observationReferences: [{ artifactKind: "debt_observation", artifactId: "observation-067", contentHash: "b".repeat(64), relativePath: "artifacts/observation-067.json" }],
    ...overrides,
  };
}
function reviewModel(overrides: Record<string, unknown> = {}) {
  const hash = "e".repeat(64);
  return {
    scope: { projectId: project.id, featureId: "feat-068", phaseNumber: 2, reviewGateId: "code-review" },
    reviewRun: { reviewRunId: "review-run-068", manifestHash: hash, manifestResult: "APPROVED", createdAt: "2026-07-19T20:00:00.000Z" },
    artifact: { artifactId: "manifest-068", artifactKind: "review_manifest", schemaVersion: 1, contentHash: hash, relativePath: `MemoryBank/Features/03_IN_PROGRESS/FEAT-068/code-reviews/artifacts/review_manifest/${hash}.json`, result: "APPROVED", ingestedAt: "2026-07-19T20:00:01.000Z" },
    persistence: { state: "COMMITTED_READ_BACK_VERIFIED", artifactReadBackHash: hash, fileReadBackHash: hash, committedAt: "2026-07-19T20:00:02.000Z" },
    gate: { scope: { projectId: project.id, featureId: "feat-068", phaseNumber: 2, reviewGateId: "code-review" }, gateDecisionId: 1, triggerArtifactHash: hash, basisManifestHash: hash, cycleId: `cycle-${hash}`, gateState: "APPROVED", reasonCode: "approved_terminal_review", evidenceHashes: [hash], decidedAt: "2026-07-19T20:00:03.000Z" },
    cycleState: "NO_REMEDIATION_REQUIRED", findings: [{ findingId: "finding-068", findingObservationId: "observation-068", defectClass: "governance-read", disposition: "OBSERVATION", severity: "note", summary: "Safe governance review finding." }], receipts: [], lineageHashes: [],
    ...overrides,
  };
}
function provider(overrides: Partial<ReturnType<GovernanceReadProvider["load"]>> = {}): GovernanceReadProvider {
  return { load: () => ({ kind: "loaded", reviewModels: [], replans: [replan("replan-z"), replan("replan-a")], debtAggregates: [], ...overrides } as Extract<ReturnType<GovernanceReadProvider["load"]>, { kind: "loaded" }>) };
}
function hydratedManifest(input: Parameters<typeof buildValidManifest>[0]) {
  const catalog = loadStrictCatalogForReview(process.cwd());
  if ("valid" in catalog && catalog.valid === false) throw new Error(catalog.message);
  const snapshot = resolveStrictActiveRule(catalog, "secret-safe-governance-artifacts");
  if (!snapshot) throw new Error("Required active rule is unavailable.");
  const manifest = buildValidManifest(input);
  return {
    ...manifest,
    ruleSnapshots: [snapshot],
    findings: manifest.findings.map((finding) => ({ ...finding, authority: { ...finding.authority, snapshot } })),
  };
}

function historicalReplan(aggregateId = "replan-history"): StoredReplanGovernanceAggregate {
  const scope = { projectId: project.id, featureId: "feat-068", phaseNumber: 2, reviewGateId: "code-review", defectClass: "governance-read" };
  const base = { ...scope, aggregateId };
  return replan(aggregateId, {
    scope,
    scopeExpansionDecisions: [
      { ...base, decisionId: "scope-accept-1", findingObservationId: "observation-accept-1", outcome: "ACCEPT", actorId: "owner-068", authorizedRole: "FEATURE_OWNER", policyId: "replan-governance-v1", policyVersion: 1, reason: "Accept bounded scope.", expectedVersion: 0, resultingVersion: 1, decidedAt: "2026-07-19T20:00:00.000Z" },
      { ...base, decisionId: "scope-accept-2", findingObservationId: "observation-accept-2", outcome: "ACCEPT", actorId: "owner-068", authorizedRole: "FEATURE_OWNER", policyId: "replan-governance-v1", policyVersion: 1, reason: "Accept bounded scope again.", expectedVersion: 1, resultingVersion: 2, decidedAt: "2026-07-19T20:00:01.000Z" },
      { ...base, decisionId: "scope-reject-1", findingObservationId: "observation-reject-1", outcome: "REJECT", actorId: "owner-068", authorizedRole: "FEATURE_OWNER", policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject excess scope.", expectedVersion: 2, resultingVersion: 3, decidedAt: "2026-07-19T20:00:02.000Z" },
    ],
    decisions: [
      { ...base, decisionId: "replan-approve-1", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, outcome: "APPROVE", actorId: "steward-068", authorizedRole: "ARCHITECTURE_STEWARD", policyId: "replan-governance-v1", policyVersion: 1, reason: "Approve bounded replan.", expectedVersion: 3, resultingVersion: 4, decidedAt: "2026-07-19T20:00:03.000Z" },
      { ...base, decisionId: "replan-reject-1", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, outcome: "REJECT", actorId: "steward-068", authorizedRole: "ARCHITECTURE_STEWARD", policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject stale replan.", expectedVersion: 4, resultingVersion: 5, decidedAt: "2026-07-19T20:00:04.000Z" },
      { ...base, decisionId: "replan-reject-2", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, outcome: "REJECT", actorId: "steward-068", authorizedRole: "ARCHITECTURE_STEWARD", policyId: "replan-governance-v1", policyVersion: 1, reason: "Reject incomplete replan.", expectedVersion: 5, resultingVersion: 6, decidedAt: "2026-07-19T20:00:05.000Z" },
    ],
    dispatchAttempts: [
      { ...base, attemptEventId: "attempt-start-1", dispatchId: "dispatch-start-1", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, approvalDecisionId: "replan-approve-1", approvalEventVersion: 4, outcome: "STARTED", workflowRunId: "workflow-start-1", attemptedAt: "2026-07-19T20:00:06.000Z" },
      { ...base, attemptEventId: "attempt-start-2", dispatchId: "dispatch-start-2", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, approvalDecisionId: "replan-approve-1", approvalEventVersion: 4, outcome: "STARTED", workflowRunId: "workflow-start-2", attemptedAt: "2026-07-19T20:00:07.000Z" },
      { ...base, attemptEventId: "attempt-failed-1", dispatchId: "dispatch-failed-1", requestId: "request-068", planHash: "a".repeat(64), planVersion: 1, approvalDecisionId: "replan-approve-1", approvalEventVersion: 4, outcome: "START_FAILED", workflowRunId: "workflow-failed-1", attemptedAt: "2026-07-19T20:00:08.000Z" },
    ],
  });
}

async function request(path: string, selectedProvider = provider(), selectedProject = project): Promise<Response> {
  const server = createServer((req, res) => {
    void handleGovernanceReadRoute(req, res, {
      findProject: (id) => id === selectedProject.id ? selectedProject : undefined,
      provider: selectedProvider,
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server address unavailable");
  cleanup.push(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return fetch(`http://127.0.0.1:${address.port}${path}`);
}

describe("FEAT-068 public governance read routes", () => {
  it("E013-GD-001 returns only an allowlisted, deterministic dashboard through the public GET route", async () => {
    const response = await request(`/api/projects/${project.id}/governance/dashboard`);
    expect(response.status).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.kind).toBe("governance_read");
    const data = body.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["architectureDebt", "metrics", "projectId", "queue", "remediations", "replans", "rollout", "schemaVersion"]);
    expect((data.queue as readonly Record<string, unknown>[]).map((item) => item.itemId)).toEqual(["replan:replan-a", "replan:replan-z"]);
    expect(JSON.stringify(body)).not.toMatch(/canonicalJson|databasePath|artifactRelativePath|authorization|secret/i);
  });

  it("E013-GD-001 refuses malformed selectors, unknown projects, and foreign replan detail", async () => {
    expect((await request(`/api/projects/${project.id}/governance/dashboard?foreign=x`)).status).toBe(400);
    expect((await request(`/api/projects/%E0%A4%A/governance/dashboard`)).status).toBe(400);
    expect((await request("/api/projects/unknown/governance/dashboard")).status).toBe(404);
    expect((await request(`/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=3&reviewGateId=code-review&defectClass=governance-read`)).status).toBe(409);
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({
      replans: [{ ...replan("replan-foreign"), scope: { ...replan("replan-foreign").scope, projectId: "foreign-project" } }],
    }))).status).toBe(503);
  });

  it("E013-GD-002 returns only an allowlisted architecture-debt record through public list and detail routes", async () => {
    const record = debt();
    const dashboard = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ debtAggregates: [record] }));
    expect(dashboard.status).toBe(200);
    const dashboardBody = await dashboard.json() as { data: { architectureDebt: Record<string, unknown>[]; queue: Record<string, unknown>[] } };
    expect(dashboardBody.data.architectureDebt).toHaveLength(1);
    expect(Object.keys(dashboardBody.data.architectureDebt[0]!).sort()).toEqual(["architecturalBoundary", "availableActions", "discovery", "eventVersion", "futureTouchDecisions", "futureTouchTrigger", "locations", "ownerId", "priority", "prioritySource", "rationale", "recordId", "risk", "rule", "state"]);
    expect(dashboardBody.data.queue.map((item) => item.itemId)).toContain(`debt:${record.recordId}`);
    expect(dashboardBody.data.architectureDebt[0]!.availableActions).toEqual(["ACCEPT_RISK", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"]);
    expect(dashboardBody.data.queue.find((item) => item.itemId === `debt:${record.recordId}`)).toMatchObject({ requiresAction: true, currentVersion: 0, urgency: "P2", availableActions: ["ACCEPT_RISK", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"] });
    expect(JSON.stringify(dashboardBody)).not.toMatch(/observationReferences|artifactRelativePath|catalogHash|databasePath/i);

    const detail = await request(`/api/projects/${project.id}/governance/architecture-debt/${record.recordId}`, provider({ debtAggregates: [record] }));
    expect(detail.status).toBe(200);
    await expect(detail.json()).resolves.toMatchObject({ kind: "governance_read", data: { architectureDebt: [{ recordId: record.recordId }] } });
  });

  it("rejects every malformed provider envelope before dereference or iteration", async () => {
    const malformed: readonly unknown[] = [undefined, null, 1, {}, { kind: "unknown" }, { kind: "store_unavailable", extra: true }, { kind: "loaded", reviewModels: [], replans: [], debtAggregates: [], extra: true }, { kind: "loaded", reviewModels: null, replans: [], debtAggregates: [] }, { kind: "loaded", reviewModels: Array.from({ length: 513 }), replans: [], debtAggregates: [] }, { kind: "loaded", reviewModels: [{}], replans: [], debtAggregates: [] }];
    for (const value of malformed) {
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => value as never });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ kind: "governance_read_refusal", code: "UNSAFE_GOVERNANCE_PROJECTION" });
    }
    const unavailable = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => ({ kind: "store_unavailable" }) });
    expect(unavailable.status).toBe(503);
    const thrown = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => { throw new Error("store failed"); } });
    expect(thrown.status).toBe(503);
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({ replans: [] }))).status).toBe(200);
  });

  it("validates every route selector before loading a provider", async () => {
    let loads = 0;
    const spy: GovernanceReadProvider = { load: () => { loads += 1; return { kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }; } };
    for (const path of [
      `/api/projects/%2Fbad/governance/dashboard`,
      `/api/projects/${project.id}/governance/replans/not-kebab_?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=2e3&reviewGateId=code-review&defectClass=governance-read`,
      `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"D".repeat(32)}`,
    ]) expect((await request(path, spy)).status).toBe(400);
    expect(loads).toBe(0);
  });

  it("executes the complete provider-envelope refusal matrix through the public route", async () => {
    const loaded = (overrides: Record<string, unknown>) => ({ kind: "loaded", reviewModels: [], replans: [], debtAggregates: [], ...overrides });
    for (const collection of ["reviewModels", "replans", "debtAggregates"] as const) {
      for (const malformed of [undefined, null, 1, Array.from({ length: 513 })]) {
        const value = loaded({ [collection]: malformed });
        if (malformed === undefined) delete value[collection];
        const response = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => value as never });
        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ code: "UNSAFE_GOVERNANCE_PROJECTION" });
      }
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => loaded({ [collection]: [{}] }) as never });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: "UNSAFE_GOVERNANCE_PROJECTION" });
    }
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => ({ kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }) })).status).toBe(200);
  });

  it("executes every selector refusal before provider load and retains valid route controls", async () => {
    let loads = 0;
    const spy: GovernanceReadProvider = { load: () => { loads += 1; return { kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }; } };
    const validDetail = `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read`;
    const invalid = [
      `/api/projects/%00/governance/dashboard`,
      `/api/projects/${project.id}/governance/dashboard?extra=1`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=-1&reviewGateId=code-review&defectClass=governance-read`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=not_kebab`,
      `/api/projects/${project.id}/governance/replans/replan-a?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read&unknown=1`,
      `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"a".repeat(31)}`,
      `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"a".repeat(32)}?extra=1`,
    ];
    for (const path of invalid) expect((await request(path, spy)).status).toBe(400);
    expect(loads).toBe(0);
    expect((await request(validDetail, provider({ replans: [replan("replan-a")] }))).status).toBe(200);
    expect((await request(`/api/projects/${project.id}/governance/architecture-debt/${debt().recordId}`, provider({ debtAggregates: [debt()] }))).status).toBe(200);
  });

  it("maps every architecture-debt action state into the public DTO and queue", async () => {
    const expected = {
      PENDING_TRIAGE: ["ACCEPT_RISK", "CONFIRM", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "REJECT", "SUPERSEDE"],
      CONFIRMED: ["ACCEPT_RISK", "CLOSE", "DEFER", "MERGE", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
      DEFERRED: ["ACCEPT_RISK", "CLOSE", "CONFIRM", "MERGE", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
      ACCEPTED_RISK: ["CLOSE", "CONFIRM", "PLAN_LINK", "REASSIGN", "SUPERSEDE"],
      PLANNED: ["ACCEPT_RISK", "CLOSE", "DEFER", "REASSIGN", "SUPERSEDE"],
      CLOSED: [], REJECTED: [], MERGED: [], SUPERSEDED: [],
    } as const;
    for (const [state, actions] of Object.entries(expected)) {
      const record = debt({
        state,
        ...(state === "MERGED" ? { duplicateOfRecordId: `ARCH-DEBT-${"e".repeat(32)}` } : {}),
        ...(state === "SUPERSEDED" ? { supersededByRecordId: `ARCH-DEBT-${"f".repeat(32)}` } : {}),
      });
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ debtAggregates: [record] }));
      expect(response.status, state).toBe(200);
      const body = await response.json() as { data: { architectureDebt: Array<{ availableActions: string[] }>; queue: Array<{ availableActions: string[]; requiresAction: boolean; currentVersion: number; urgency: string }> } };
      expect(body.data.architectureDebt[0]!.availableActions).toEqual(actions);
      expect(body.data.queue.find((item) => item.urgency === "P2")!).toMatchObject({ availableActions: actions, requiresAction: actions.length > 0, currentVersion: 0 });
    }
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({ debtAggregates: [debt({ state: "UNKNOWN" })] }))).status).toBe(503);
  });

  it("reports validated replan outcome histories as exact public metric families", async () => {
    const response = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ replans: [historicalReplan()] }));
    expect(response.status).toBe(200);
    const body = await response.json() as { data: { metrics: Record<string, unknown> } };
    expect(body.data.metrics.scopeDecisionOutcomes).toEqual([{ key: "ACCEPT", count: 2 }, { key: "REJECT", count: 1 }]);
    expect(body.data.metrics.replanDecisionOutcomes).toEqual([{ key: "APPROVE", count: 1 }, { key: "REJECT", count: 2 }]);
    expect(body.data.metrics.dispatchOutcomes).toEqual([{ key: "STARTED", count: 2 }, { key: "START_FAILED", count: 1 }]);
    const empty = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ replans: [] }));
    expect((await empty.json() as { data: { metrics: Record<string, unknown> } }).data.metrics).toMatchObject({ scopeDecisionOutcomes: [], replanDecisionOutcomes: [], dispatchOutcomes: [] });
    const malformed = historicalReplan("replan-malformed");
    const invalid = { ...malformed, dispatchAttempts: [{ ...malformed.dispatchAttempts[0]!, outcome: "UNKNOWN" }] };
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({ replans: [invalid] }))).status).toBe(503);
  });

  it("requires the exact single scope-expansion target and never falls back to informational", async () => {
    const finding = { findingId: "finding-scope", findingObservationId: "observation-scope", defectClass: "governance-read", disposition: "SCOPE_EXPANSION", severity: "required", summary: "Scope decision needs confirmation." };
    const model = reviewModel({ findings: [finding] });
    const matching = replan("replan-scope");
    const success = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [model], replans: [matching] }));
    expect(success.status).toBe(200);
    const body = await success.json() as { data: { remediations: Array<{ findings: Array<{ scopeDecisionTarget: unknown }> }> ; queue: Array<{ itemId: string; requiresAction: boolean; targetId: string }> } };
    expect(body.data.remediations[0]!.findings[0]!.scopeDecisionTarget).toEqual({ aggregateId: "replan-scope", expectedVersion: 0 });
    expect(body.data.queue.find((item) => item.itemId === "remediation:review-run-068:finding-scope")).toMatchObject({ requiresAction: true, targetId: "observation-scope" });
    for (const replans of [[], [matching, replan("replan-scope-duplicate")], [replan("replan-foreign", { scope: { ...matching.scope, featureId: "feat-foreign" } })]]) {
      expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [model], replans }))).status).toBe(503);
    }
    const observation = reviewModel({ findings: [{ ...finding, disposition: "OBSERVATION", severity: "note" }] });
    const informational = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [observation], replans: [matching] }));
    expect((await informational.json() as { data: { remediations: Array<{ findings: Array<{ scopeDecisionTarget: unknown }> }> } }).data.remediations[0]!.findings[0]!.scopeDecisionTarget).toBeNull();
  });

  it("rejects review-run metadata that does not bind exactly to the gate basis manifest", async () => {
    const base = reviewModel();
    const validRun = base.reviewRun as Record<string, unknown>;
    const malformedModels: unknown[] = [
      reviewModel({ reviewRun: undefined }), reviewModel({ reviewRun: null }), reviewModel({ reviewRun: 1 }),
      reviewModel({ reviewRun: { ...validRun, manifestHash: "A".repeat(64) } }),
      reviewModel({ reviewRun: { ...validRun, createdAt: "not-a-time" } }),
      reviewModel({ reviewRun: { ...validRun, manifestHash: "f".repeat(64) } }),
    ];
    for (const member of ["reviewRunId", "manifestHash", "manifestResult", "createdAt"] as const) {
      const absent = { ...validRun }; delete absent[member];
      malformedModels.push(
        reviewModel({ reviewRun: absent }),
        reviewModel({ reviewRun: { ...validRun, [member]: null } }),
        reviewModel({ reviewRun: { ...validRun, [member]: 1 } }),
        reviewModel({ reviewRun: { ...validRun, [member]: [] } }),
      );
    }
    for (const scopeMember of ["projectId", "featureId", "phaseNumber", "reviewGateId"] as const) {
      malformedModels.push(reviewModel({ scope: { ...base.scope, [scopeMember]: scopeMember === "phaseNumber" ? 3 : `foreign-${scopeMember}` } }));
    }
    for (const model of malformedModels) {
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [model] }));
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ code: "UNSAFE_GOVERNANCE_PROJECTION" });
    }
  });

  it("binds dashboard remediation metadata to the persisted basis manifest when a response and receipt are the current trigger", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "feat-068-review-run-"));
    const featureRootPath = "MemoryBank/Features/03_IN_PROGRESS/FEAT-068-review-governance-dashboard-and-operational-roll";
    const runtimeProject = { id: "project-feat-068-route", rootPath: projectRoot };
    const scope = { projectId: runtimeProject.id, featureId: "feat-068", phaseNumber: 2, reviewGateId: "code-review" } as const;
    const ingestedAt = "2026-07-19T20:00:00.000Z";
    try {
      mkdirSync(join(projectRoot, ".hepha"), { recursive: true });
      copyFileSync(join(process.cwd(), ".hepha", "architecture-rules.yaml"), join(projectRoot, ".hepha", "architecture-rules.yaml"));
      const databasePath = join(projectRoot, ".hepha", "hepha.sqlite");
      const manifest = hydratedManifest({ artifactId: "manifest-route-basis", scope, result: "NEEDS_CHANGES" });
      const manifestValidation = validateReviewContractArtifact(JSON.stringify(manifest), { projectRoot, featurePath: featureRootPath, expectedManifestScope: scope });
      if (!manifestValidation.valid) throw new Error(`Manifest control must validate: ${manifestValidation.message}`);
      const manifestResult = ingestAndRenderAuthoritativeReview({ projectRoot, databasePath, featureRootPath, expectedScope: scope, validationResult: manifestValidation, ingestedAt, enforcementEnabled: true });
      if (manifestResult.kind !== "persisted") throw new Error("Manifest control must persist.");
      const manifestReference = { artifactKind: "review_manifest" as const, artifactId: manifest.artifactId, contentHash: manifestResult.ingestion.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/review_manifest/${manifestResult.ingestion.contentHash}.json` };
      const reviewStore = openAuthoritativeReviewStore(projectRoot, databasePath);
      if (!reviewStore) throw new Error("Review store must reopen.");
      const persistedRun = reviewStore.getReviewRunByManifestHash(manifestResult.ingestion.contentHash);
      reviewStore.close();
      if (!persistedRun) throw new Error("Basis review run must persist.");
      const expectedMetadata = { reviewRunId: persistedRun.reviewRunId, manifestHash: manifestResult.ingestion.contentHash, manifestResult: "NEEDS_CHANGES", createdAt: persistedRun.createdAt };
      const manifestTrigger = await request(`/api/projects/${scope.projectId}/governance/dashboard`, createSqliteGovernanceReadProvider(databasePath), runtimeProject);
      expect(manifestTrigger.status).toBe(200);
      const manifestBody = await manifestTrigger.json() as { data: { remediations: Array<typeof expectedMetadata>; queue: Array<{ itemId: string }> } };
      expect(manifestBody.data.remediations[0]).toEqual(expect.objectContaining(expectedMetadata));
      expect(manifestBody.data.queue).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: `remediation:${persistedRun.reviewRunId}:${manifest.findings[0]!.findingId}` })]));
      const response = buildValidRemediationResponse({ artifactId: "response-route-basis", scope, manifestReference });
      const responseResult = ingestAndRenderAuthoritativeReviewSuccessor({ projectRoot, databasePath, featureRootPath, expectedScope: scope, rawPayload: JSON.stringify(response), ingestedAt, enforcementEnabled: true });
      if (responseResult.kind !== "persisted") throw new Error("Response control must persist.");
      const responseReference = { artifactKind: "remediation_response" as const, artifactId: response.artifactId, contentHash: responseResult.ingestion.contentHash, relativePath: `${featureRootPath}/code-reviews/artifacts/remediation_response/${responseResult.ingestion.contentHash}.json` };
      const receipt = buildValidVerificationReceipt({ artifactId: "receipt-route-trigger", scope, manifestReference, responseReference });
      const receiptResult = ingestAndRenderAuthoritativeReviewSuccessor({ projectRoot, databasePath, featureRootPath, expectedScope: scope, rawPayload: JSON.stringify(receipt), ingestedAt, enforcementEnabled: true });
      if (receiptResult.kind !== "persisted") throw new Error("Receipt control must persist.");
      const receiptTrigger = await request(`/api/projects/${scope.projectId}/governance/dashboard`, createSqliteGovernanceReadProvider(databasePath), runtimeProject);
      expect(receiptTrigger.status).toBe(200);
      const body = await receiptTrigger.json() as { data: { remediations: Array<{ reviewRunId: string; manifestHash: string; manifestResult: string; createdAt: string }>; queue: Array<{ itemId: string }> } };
      expect(body.data.remediations[0]).toEqual(expect.objectContaining(expectedMetadata));
      expect(body.data.queue).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: `remediation:${persistedRun.reviewRunId}:${manifest.findings[0]!.findingId}` })]));
      for (const forbiddenTriggerValue of [receipt.artifactId, receiptResult.ingestion.contentHash, `${featureRootPath}/code-reviews/artifacts/verification_receipt/${receiptResult.ingestion.contentHash}.json`]) {
        expect(JSON.stringify(body)).not.toContain(forbiddenTriggerValue);
      }
    } finally { rmSync(projectRoot, { recursive: true, force: true }); }
  });

  it("returns bound review-run metadata and recursively detached frozen data", () => {
    const source = reviewModel();
    const replanSource = replan("replan-a");
    const debtSource = debt();
    const sourceSnapshot = JSON.stringify([source, replanSource, debtSource]);
    const result = readGovernanceDashboard({ project, provider: { load: () => ({ kind: "loaded", reviewModels: [source], replans: [replanSource], debtAggregates: [debtSource] }) } });
    expect(result.kind).toBe("governance_read");
    if (result.kind !== "governance_read") return;
    expect(result.data.remediations[0]).toMatchObject({ reviewRunId: "review-run-068", manifestHash: "e".repeat(64), manifestResult: "APPROVED", createdAt: "2026-07-19T20:00:00.000Z" });
    const visit = (value: unknown): void => { if (value && typeof value === "object") { expect(Object.isFrozen(value)).toBe(true); for (const member of Object.values(value)) visit(member); } };
    visit(result.data);
    const mutationAttempts = [
      () => { (result.data.remediations[0]!.findings[0]! as { summary: string }).summary = "mutated"; },
      () => { (result.data.replans[0]!.recurrence as { postFixManifestations: number }).postFixManifestations = 99; },
      () => { (result.data.architectureDebt[0]!.rule as { ruleId: string }).ruleId = "mutated"; },
      () => { (result.data.queue[0] as { summaryCode: string }).summaryCode = "mutated"; },
      () => { (result.data.metrics as { reviewRuns: number }).reviewRuns = 99; },
      () => { (result.data.rollout as { mode: string }).mode = "ACTIVE"; },
    ];
    for (const mutate of mutationAttempts) expect(mutate).toThrow();
    expect(result.data.remediations[0]!.findings[0]!.summary).toBe("Safe governance review finding.");
    expect(JSON.stringify([source, replanSource, debtSource])).toBe(sourceSnapshot);
    const assertUnfrozenProviderTree = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(false);
        for (const member of Object.values(value)) assertUnfrozenProviderTree(member);
      }
    };
    for (const providerValue of [source, replanSource, debtSource]) assertUnfrozenProviderTree(providerValue);
  });

  it("ranks all debt-action state rows deterministically with competing remediation, replan, and debt queue items", async () => {
    const finding = { findingId: "finding-rank", findingObservationId: "observation-rank", defectClass: "governance-read", disposition: "SCOPE_EXPANSION", severity: "required", summary: "Ranked scope action." };
    const states = ["PENDING_TRIAGE", "CONFIRMED", "DEFERRED", "ACCEPTED_RISK", "PLANNED", "CLOSED", "REJECTED", "MERGED", "SUPERSEDED"];
    for (const state of states) {
      const record = debt({
        state,
        ...(state === "MERGED" ? { duplicateOfRecordId: `ARCH-DEBT-${"e".repeat(32)}` } : {}),
        ...(state === "SUPERSEDED" ? { supersededByRecordId: `ARCH-DEBT-${"f".repeat(32)}` } : {}),
      });
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, provider({
        reviewModels: [reviewModel({ findings: [finding] })],
        replans: [replan("replan-rank")],
        debtAggregates: [record],
      }));
      expect(response.status, state).toBe(200);
      const body = await response.json() as { data: { queue: Array<{ itemId: string; requiresAction: boolean; urgency: string; itemKind: string }> } };
      expect(body.data.queue.map((item) => item.itemId)).toEqual(["remediation:review-run-068:finding-rank", `debt:${record.recordId}`, "replan:replan-rank"]);
      expect(body.data.queue).toEqual(expect.arrayContaining([
        expect.objectContaining({ itemId: "remediation:review-run-068:finding-rank", requiresAction: true, urgency: "SCOPE_EXPANSION", itemKind: "REMEDIATION" }),
        expect.objectContaining({ itemId: "replan:replan-rank", requiresAction: false, urgency: "INFORMATIONAL", itemKind: "REPLAN" }),
        expect.objectContaining({ itemId: `debt:${record.recordId}`, requiresAction: !["CLOSED", "REJECTED", "MERGED", "SUPERSEDED"].includes(state), itemKind: "ARCHITECTURE_DEBT" }),
      ]));
    }
  });

  it("executes every dashboard, replan-detail, and debt-detail selector rejection before provider load", async () => {
    let loads = 0;
    const spy: GovernanceReadProvider = { load: () => { loads += 1; return { kind: "loaded", reviewModels: [], replans: [], debtAggregates: [] }; } };
    const base = `/api/projects/${project.id}/governance/replans/replan-a`;
    const required = "featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read";
    const invalid = [
      `/api/projects//governance/dashboard`, `/api/projects/${"a".repeat(257)}/governance/dashboard`, `/api/projects/%00/governance/dashboard`, `/api/projects/%ED%A0%80/governance/dashboard`, `/api/projects/%E0%A4%A/governance/dashboard`, `/api/projects/%2F/governance/dashboard`, `/api/projects/%5C/governance/dashboard`, `/api/projects/http:%252f%252fevil/governance/dashboard`, `/api/projects/${project.id}/governance/dashboard?extra=1`,
      `${base}?featureId=&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read`, `${base}?${required}&featureId=feat-068`, `${base}?featureId=feat-068&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=-1&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=2.0&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=2e3&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=9007199254740992&reviewGateId=code-review&defectClass=governance-read`, `${base}?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=not_kebab`, `${base}?featureId=feat-068&phaseNumber=2&reviewGateId=code-review&defectClass=governance-read&extra=1`, `/api/projects/${project.id}/governance/replans/%2F?${required}`,
      `/api/projects/${project.id}/governance/architecture-debt/`, `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"a".repeat(31)}`, `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"A".repeat(32)}`, `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"a".repeat(32)}%2F`, `/api/projects/${project.id}/governance/architecture-debt/ARCH-DEBT-${"a".repeat(32)}?extra=1`,
    ];
    const queryMembers = ["featureId", "reviewGateId", "defectClass"] as const;
    for (const member of queryMembers) {
      const validValue = member === "featureId" ? "feat-068" : member === "reviewGateId" ? "code-review" : "governance-read";
      for (const malformed of ["a".repeat(257), "%00", "%ED%A0%80"]) {
        invalid.push(`${base}?${required.replace(`${member}=${validValue}`, `${member}=${malformed}`)}`);
      }
      invalid.push(`${base}?${required.split("&").filter((entry) => !entry.startsWith(`${member}=`)).join("&")}`);
    }
    for (const malformed of ["a".repeat(257), "%00", "%ED%A0%80"]) invalid.push(`/api/projects/${project.id}/governance/replans/${malformed}?${required}`);
    const absentPhase = await request(`${base}?featureId=feat-068&reviewGateId=code-review&defectClass=governance-read`, spy);
    expect(absentPhase.status).toBe(400);
    await expect(absentPhase.json()).resolves.toMatchObject({ kind: "governance_read_refusal", code: "INVALID_REQUEST" });
    expect(loads).toBe(0);
    for (const path of invalid) expect((await request(path, spy)).status, path).toBe(400);
    expect(loads).toBe(0);
    expect((await request(`/api/projects/${project.id}/governance/dashboard`, spy)).status).toBe(200);
    expect((await request(`${base}?${required}`, provider({ replans: [replan("replan-a")] }))).status).toBe(200);
    expect((await request(`/api/projects/${project.id}/governance/architecture-debt/${debt().recordId}`, provider({ debtAggregates: [debt()] }))).status).toBe(200);
  });

  it("executes every scope-expansion target binding row through the public route", async () => {
    const scopeFinding = { findingId: "finding-target", findingObservationId: "observation-target", defectClass: "governance-read", disposition: "SCOPE_EXPANSION", severity: "required", summary: "Bound scope action." };
    const matching = replan("replan-target");
    const success = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [reviewModel({ findings: [scopeFinding] })], replans: [matching] }));
    expect(success.status).toBe(200);
    const successBody = await success.json() as { data: { remediations: Array<{ findings: Array<{ scopeDecisionTarget: unknown }> }>; queue: Array<Record<string, unknown>> } };
    expect(successBody.data.remediations).toEqual(expect.arrayContaining([expect.objectContaining({ findings: [expect.objectContaining({ scopeDecisionTarget: { aggregateId: "replan-target", expectedVersion: 0 } })] })]));
    expect(successBody.data.queue).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: "remediation:review-run-068:finding-target", targetId: "observation-target", currentVersion: 0, requiresAction: true, urgency: "SCOPE_EXPANSION", availableActions: ["ACCEPT_SCOPE_EXPANSION", "REJECT_SCOPE_EXPANSION"] })]));
    for (const override of [
      { scope: { ...matching.scope, projectId: "foreign-project" } }, { scope: { ...matching.scope, phaseNumber: 3 } }, { scope: { ...matching.scope, reviewGateId: "other-gate" } }, { scope: { ...matching.scope, defectClass: "other-class" } }, { eventVersion: -1 }, { eventVersion: 1.5 },
    ]) expect((await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [reviewModel({ findings: [scopeFinding] })], replans: [{ ...matching, ...override }] }))).status).toBe(503);
    for (const disposition of ["IN_SCOPE_BLOCKER", "ARCHITECTURE_DEBT", "OBSERVATION"] as const) {
      const response = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [reviewModel({ findings: [{ ...scopeFinding, disposition, severity: disposition === "IN_SCOPE_BLOCKER" ? "required" : "note" }] })], replans: [matching] }));
      expect(response.status).toBe(200);
      const informationalBody = await response.json() as { data: { remediations: Array<{ findings: Array<{ scopeDecisionTarget: unknown }> }>; queue: Array<Record<string, unknown>> } };
      expect(informationalBody.data.remediations).toEqual(expect.arrayContaining([expect.objectContaining({ findings: [expect.objectContaining({ scopeDecisionTarget: null })] })]));
      expect(informationalBody.data.queue).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: "remediation:review-run-068:finding-target", targetId: "observation-target", currentVersion: null, requiresAction: false, urgency: "INFORMATIONAL", availableActions: [] })]));
    }
  });

  it("E013-GD-002 fails closed for unsafe provider data and an unavailable store rather than treating either as empty", async () => {
    const empty = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ replans: [] }));
    expect(empty.status).toBe(200);
    expect((await empty.json() as { data: { queue: unknown[]; metrics: { replanAggregates: number } } }).data).toMatchObject({ queue: [], metrics: { replanAggregates: 0 } });

    const malformed = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [{}] }));
    expect(malformed.status).toBe(503);
    await expect(malformed.json()).resolves.toMatchObject({ kind: "governance_read_refusal", code: "UNSAFE_GOVERNANCE_PROJECTION" });

    const unsafe = await request(`/api/projects/${project.id}/governance/dashboard`, provider({ reviewModels: [{ summary: "secret=not-for-response" }] }));
    expect(unsafe.status).toBe(503);
    await expect(unsafe.json()).resolves.toMatchObject({ kind: "governance_read_refusal", code: "UNSAFE_GOVERNANCE_PROJECTION" });

    const unavailable = await request(`/api/projects/${project.id}/governance/dashboard`, { load: () => ({ kind: "store_unavailable" }) });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ kind: "governance_read_refusal", code: "GOVERNANCE_STORE_UNAVAILABLE" });
  });
});
