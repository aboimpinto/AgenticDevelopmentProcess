import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DirectHostRuntimeEvidenceStore } from "@hepha/db";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  type PhaseSummary,
  type OrchestratedRuntimeEvidenceV1,
  type RuntimeEvidenceGuardContextV1,
} from "@hepha/shared";
import {
  readFeatureRuntimeEvidence,
  readPhaseRuntimeEvidence,
  type RuntimeEvidenceApplicationDependencies,
} from "../src/application/runtime-evidence/runtime-evidence-application.js";
import { createRuntimeEvidenceApplications } from "../src/bootstrap/runtime-evidence-applications.js";

const route = { connectionId: "connection-safe", modelId: "model-safe" };
const evidence: OrchestratedRuntimeEvidenceV1 = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  mode: "orchestrated",
  receipt: {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    invocationId: "invocation-1",
    rootInvocationId: "invocation-1",
    parentInvocationId: null,
    invocationKind: "root",
    planHash: "a".repeat(64),
    actionId: "continue-implementing",
    actionType: "implementation",
    roleId: "implementation-agent",
    promptVersion: "implementation/v1",
    policySource: "action",
    revisionId: "revision-41",
    approvedPrimaryRoute: route,
    approvedSecondRoute: null,
    projectId: "/workspace/project",
    cardKey: "feature:FEAT-TEST",
    workflowRunId: "run-1",
    workflowNodeId: "node-1",
    phaseExecutionContractId: "delivery-contract",
    phaseNumber: 3,
    taskId: "task-1",
    correlationId: "correlation-1",
    selectedLessonIds: [],
    attemptIds: ["attempt-1"],
    routeChangeEventIds: [],
    status: "completed",
    openedAt: "2026-07-23T10:00:00.000Z",
    settledAt: "2026-07-23T10:01:00.000Z",
    durationMs: 60_000,
    failureCode: null,
  },
  attempts: [{
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    attemptId: "attempt-1",
    invocationId: "invocation-1",
    attemptIndex: 0,
    attemptKind: "primary",
    approvedRoute: route,
    actualRoute: route,
    providerId: "provider-safe",
    authenticationConnectionId: "connection-safe",
    authenticationKind: "pi_session",
    credentialVersion: null,
    workState: "none",
    checkpointId: null,
    checkpointCursor: null,
    status: "completed",
    preparationStartedAt: "2026-07-23T10:00:00.000Z",
    startedAt: "2026-07-23T10:00:01.000Z",
    spawnedAt: "2026-07-23T10:00:02.000Z",
    terminalAt: "2026-07-23T10:01:00.000Z",
    durationMs: 60_000,
    exitCode: 0,
    timeoutMarker: false,
    failureCode: null,
  }],
  routeChangeEvents: [],
};

function phase(id: string | null, number: number, status: string): PhaseSummary {
  return {
    executionContractId: id,
    defaultImplementationModel: null,
    documentPath: `/phase-${number}.md`,
    documentRelativePath: `Phases/phase-${number}.md`,
    estimatedAiTime: null,
    estimatedHumanTime: null,
    fileName: `phase-${number}.md`,
    number,
    predictedModel: null,
    predictedModelSource: "workflow_policy",
    recommendedAgent: null,
    recommendedModel: null,
    status,
    title: `Phase ${number}`,
    updatedAt: "2026-07-23T10:00:00.000Z",
  };
}

const context: RuntimeEvidenceGuardContextV1 = {
  isRegisteredAction: (actionId) => actionId === "continue-implementing",
  isTrustedDirectInstrumentation: () => false,
};
const directEvidence = {
  schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
  mode: "direct_host" as const,
  evidenceId: "direct-1",
  projectId: "project-public",
  cardKey: "feature:FEAT-TEST",
  phaseExecutionContractId: "delivery-contract",
  phaseNumber: 3,
  taskId: "task-direct",
  procedureId: "continue-implementation",
  actionId: "continue-implementing",
  hostKind: "codex" as const,
  hostIdentity: null,
  startedAt: "2026-07-23T10:02:00.000Z",
  settledAt: "2026-07-23T10:02:30.000Z",
  durationMs: 30_000,
  outcome: "completed" as const,
  failureCode: null,
  stateSync: { status: "completed" as const, operationId: "sync-1" },
  modelEvidence: { status: "not_recorded" as const },
};

function dependencies(): RuntimeEvidenceApplicationDependencies {
  return {
    context,
    resolveFeature: vi.fn(async () => ({
      projectId: "project-public",
      receiptProjectId: "/workspace/project",
      cardKey: "feature:FEAT-TEST",
      phases: [phase("pending-contract", 1, "PENDING"), phase(null, 2, "COMPLETED"), phase("delivery-contract", 3, "COMPLETED")],
    })),
    orchestratedStore: {
      listFeatureInvocations: vi.fn(() => ({ ok: true, value: [evidence] })),
    },
    directHostStore: {
      listFeatureEvidence: vi.fn(() => ({ ok: true, value: [directEvidence] })),
    },
  };
}

describe("runtime evidence application", () => {
  it("projects actual persisted facts and honest empty/legacy states without chain history in the summary", async () => {
    const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, dependencies());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.phases.map((item) => item.state)).toEqual(["not_yet_run", "not_recorded", "completed"]);
    expect(result.value.phases[2]).toMatchObject({
      invocationCount: 2,
      executionModes: ["direct_host", "orchestrated"],
      directModelEvidence: [{ status: "not_recorded" }],
      actualRoutes: [route],
      aggregateDurationMs: 90_000,
      finalOutcome: "completed",
    });
    expect(JSON.stringify(result.value)).not.toContain("attempt-1");
  });

  it("projects a bounded complete chain page and emits an opaque advancing cursor", async () => {
    const result = await readPhaseRuntimeEvidence({
      projectId: "project-public",
      cardKey: "feature:FEAT-TEST",
      phaseExecutionContractId: "delivery-contract",
      cursor: null,
      limit: 1,
    }, dependencies());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.executions[0]).toMatchObject({
      approvedPlan: { primaryRoute: route, revisionId: "revision-41" },
      attempts: [{ actualRoute: route, checkpointId: null }],
    });
    expect(result.value.nextCursor).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(JSON.stringify(result.value)).not.toMatch(/secret|checkpointCursor|raw error|environment/iu);
  });

  it("qualifies equal raw IDs by mode for unpaged ordering and cursor pagination", async () => {
    const collidingDirect = {
      ...directEvidence,
      evidenceId: evidence.receipt.invocationId,
      startedAt: evidence.receipt.openedAt,
      settledAt: "2026-07-23T10:00:30.000Z",
      durationMs: 30_000,
    };
    const deps = dependencies();
    vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [collidingDirect] });
    const input = {
      projectId: "project-public",
      cardKey: "feature:FEAT-TEST",
      phaseExecutionContractId: "delivery-contract",
      cursor: null,
      limit: 10,
    };
    const unpaged = await readPhaseRuntimeEvidence(input, deps);
    expect(unpaged).toMatchObject({
      ok: true,
      value: { executions: [{ mode: "direct_host", evidenceId: "invocation-1" }, { mode: "orchestrated", invocationId: "invocation-1" }] },
    });

    const first = await readPhaseRuntimeEvidence({ ...input, limit: 1 }, deps);
    expect(first).toMatchObject({ ok: true, value: { executions: [{ mode: "direct_host" }] } });
    if (!first.ok || first.value.nextCursor === null) throw new Error("Expected advancing mixed-mode cursor.");
    const second = await readPhaseRuntimeEvidence({ ...input, limit: 1, cursor: first.value.nextCursor }, deps);
    expect(second).toMatchObject({ ok: true, value: { executions: [{ mode: "orchestrated" }], nextCursor: null } });
  });

  it("orders equal-time non-canonical Z, underscore, z, and ä execution IDs through unpaged read and cursor pagination", async () => {
    const deps = dependencies();
    // Isolate the orchestrated authority — must return no rows for this exact fixture
    vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [] });
    const ZExecution = {
      ...directEvidence, evidenceId: "Z-execution", startedAt: evidence.receipt.openedAt,
      settledAt: "2026-07-23T10:00:30.000Z", durationMs: 30_000,
    };
    const underscoreExecution = {
      ...directEvidence, evidenceId: "_execution", startedAt: evidence.receipt.openedAt,
      settledAt: "2026-07-23T10:00:30.000Z", durationMs: 30_000,
    };
    const zExecution = {
      ...directEvidence, evidenceId: "z-execution", startedAt: evidence.receipt.openedAt,
      settledAt: "2026-07-23T10:00:30.000Z", durationMs: 30_000,
    };
    const aUmlautExecution = {
      ...directEvidence, evidenceId: "ä-execution", startedAt: evidence.receipt.openedAt,
      settledAt: "2026-07-23T10:00:30.000Z", durationMs: 30_000,
    };
    // Supply in non-canonical reverse-alphabetical input order
    vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({
      ok: true,
      value: [aUmlautExecution, zExecution, underscoreExecution, ZExecution],
    });
    const input = {
      projectId: "project-public",
      cardKey: "feature:FEAT-TEST",
      phaseExecutionContractId: "delivery-contract",
      cursor: null,
      limit: 10,
    };

    // Unpaged read: strict UTF-16 code-unit order is Z (0x5A), _ (0x5F), z (0x7A), ä (0xE4)
    // Orchestrated authority returns no rows — exactly four direct IDs expected
    const unpaged = await readPhaseRuntimeEvidence(input, deps);
    expect(unpaged.ok).toBe(true);
    if (!unpaged.ok) return;
    expect(unpaged.value.executions.map((e) => e.mode === "direct_host" ? e.evidenceId : e.invocationId))
      .toEqual(["Z-execution", "_execution", "z-execution", "ä-execution"]);

    // Limit-2 cursor page: Z-execution, _execution, non-null cursor
    const first = await readPhaseRuntimeEvidence({ ...input, limit: 2 }, deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.executions.map((e) => e.mode === "direct_host" ? e.evidenceId : e.invocationId))
      .toEqual(["Z-execution", "_execution"]);
    expect(first.value.nextCursor).not.toBeNull();

    // Continuation from cursor: z-execution, ä-execution, null cursor (no orchestrated rows)
    const second = await readPhaseRuntimeEvidence({ ...input, limit: 2, cursor: first.value.nextCursor }, deps);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.executions.map((e) => e.mode === "direct_host" ? e.evidenceId : e.invocationId))
      .toEqual(["z-execution", "ä-execution"]);
    expect(second.value.nextCursor).toBeNull();
  });

  it("rejects foreign store records before projection", async () => {
    const deps = dependencies();
    const foreignDirect = {
      schemaVersion: "runtime-execution/v1" as const,
      mode: "direct_host" as const,
      evidenceId: "direct-foreign",
      projectId: "foreign-project",
      cardKey: "feature:FEAT-FOREIGN",
      phaseExecutionContractId: "foreign-contract",
      phaseNumber: 5,
      taskId: null,
      procedureId: "continue-implementation",
      actionId: "continue-implementing",
      hostKind: "pi" as const,
      hostIdentity: null,
      startedAt: "2026-07-23T10:03:00.000Z",
      settledAt: "2026-07-23T10:03:30.000Z",
      durationMs: 30_000,
      outcome: "completed" as const,
      failureCode: null,
      stateSync: { status: "completed" as const, operationId: "sync-foreign" },
      modelEvidence: { status: "not_recorded" as const },
    };
    vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [foreignDirect] });

    const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
    expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
  });

  it("rejects mixed-mode foreign project and card records through both feature and phase reads", async () => {
    const foreignDirectProject = {
      ...directEvidence, evidenceId: "foreign-direct-project", projectId: "foreign-project",
    };
    const foreignDirectCard = {
      ...directEvidence, evidenceId: "foreign-direct-card", cardKey: "feature:FEAT-FOREIGN",
    };
    const foreignOrchestratedProject = {
      ...evidence, receipt: { ...evidence.receipt, invocationId: "foreign-orch-project", projectId: "/workspace/foreign" },
    };
    const foreignOrchestratedCard = {
      ...evidence, receipt: { ...evidence.receipt, invocationId: "foreign-orch-card", cardKey: "feature:FEAT-FOREIGN" },
    };

    // Feature read: direct foreign project with a valid orchestrated row present — proves no partial publication
    {
      const deps = dependencies();
      vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [foreignDirectProject] });
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [evidence] });
      const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Feature read: direct foreign card with a valid orchestrated row present
    {
      const deps = dependencies();
      vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [foreignDirectCard] });
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [evidence] });
      const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Feature read: orchestrated foreign project with a valid direct row present
    {
      const deps = dependencies();
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [foreignOrchestratedProject] });
      const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Feature read: orchestrated foreign card with a valid direct row present
    {
      const deps = dependencies();
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [foreignOrchestratedCard] });
      const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Phase read: direct foreign project with a valid orchestrated row present
    {
      const deps = dependencies();
      vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [foreignDirectProject] });
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [evidence] });
      const result = await readPhaseRuntimeEvidence({
        projectId: "project-public",
        cardKey: "feature:FEAT-TEST",
        phaseExecutionContractId: "delivery-contract",
        cursor: null,
        limit: 10,
      }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Phase read: direct foreign card with a valid orchestrated row present
    {
      const deps = dependencies();
      vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [foreignDirectCard] });
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [evidence] });
      const result = await readPhaseRuntimeEvidence({
        projectId: "project-public",
        cardKey: "feature:FEAT-TEST",
        phaseExecutionContractId: "delivery-contract",
        cursor: null,
        limit: 10,
      }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Phase read: orchestrated foreign card with a valid direct row present
    {
      const deps = dependencies();
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [foreignOrchestratedCard] });
      const result = await readPhaseRuntimeEvidence({
        projectId: "project-public",
        cardKey: "feature:FEAT-TEST",
        phaseExecutionContractId: "delivery-contract",
        cursor: null,
        limit: 10,
      }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }

    // Phase read: orchestrated foreign project with a valid direct row present
    {
      const deps = dependencies();
      vi.mocked(deps.orchestratedStore.listFeatureInvocations).mockReturnValue({ ok: true, value: [foreignOrchestratedProject] });
      const result = await readPhaseRuntimeEvidence({
        projectId: "project-public",
        cardKey: "feature:FEAT-TEST",
        phaseExecutionContractId: "delivery-contract",
        cursor: null,
        limit: 10,
      }, deps);
      expect(result).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_UNAVAILABLE" });
    }
  });

  it("accepts a mixed-mode read when both store authorities return valid matched identity records", async () => {
    const deps = dependencies();
    const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }) });
  });

  it("omits other-phase evidence from the requested phase page while the requested member remains", async () => {
    const deps = dependencies();
    const directPhaseOther = {
      ...directEvidence,
      evidenceId: "direct-other-phase",
      phaseExecutionContractId: "pending-contract",
      phaseNumber: 1,
      startedAt: "2026-07-23T10:05:00.000Z",
      settledAt: "2026-07-23T10:05:30.000Z",
      durationMs: 30_000,
    };
    vi.mocked(deps.directHostStore.listFeatureEvidence).mockReturnValue({ ok: true, value: [directEvidence, directPhaseOther] });

    // Feature read should include both phases' evidence in their respective summaries
    const featureResult = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, deps);
    expect(featureResult).toEqual({ ok: true, value: expect.objectContaining({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }) });

    // Phase read for delivery-contract should include only its own evidence, not the other phase's
    // Sort order is by [startedAt/openedAt, mode, id]; direct-1 (10:02:00) comes after orchestrated (10:00:00)
    const phaseResult = await readPhaseRuntimeEvidence({
      projectId: "project-public",
      cardKey: "feature:FEAT-TEST",
      phaseExecutionContractId: "delivery-contract",
      cursor: null,
      limit: 10,
    }, deps);
    expect(phaseResult).toEqual({ ok: true, value: expect.objectContaining({
      phaseExecutionContractId: "delivery-contract",
    }) });
    // The other-phase direct evidence must not appear
    expect(phaseResult.ok).toBe(true);
    if (phaseResult.ok) {
      expect(phaseResult.value.executions.find((ex) => ex.mode === "direct_host" && ex.evidenceId === "direct-other-phase")).toBeUndefined();
      // The requested phase member must appear
      expect(phaseResult.value.executions.find((ex) => ex.mode === "orchestrated" && ex.invocationId === "invocation-1")).toBeDefined();
      expect(phaseResult.value.executions.find((ex) => ex.mode === "direct_host" && ex.evidenceId === "direct-1")).toBeDefined();
    }
  });

  it("returns direct model identities in strict UTF-16 code-unit order", async () => {
    const deps = dependencies();
    const zModel = {
      ...directEvidence, evidenceId: "direct-z", startedAt: "2026-07-23T10:00:00.000Z",
      settledAt: "2026-07-23T10:00:30.000Z", modelEvidence: {
        status: "recorded" as const, modelId: "z-model", providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:00.000Z",
      },
    };
    const aUmlautModel = {
      ...directEvidence, evidenceId: "direct-aumlaut", startedAt: "2026-07-23T10:00:01.000Z",
      settledAt: "2026-07-23T10:00:31.000Z", modelEvidence: {
        status: "recorded" as const, modelId: "ä-model", providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:01.000Z",
      },
    };
    const ZModel = {
      ...directEvidence, evidenceId: "direct-Z", startedAt: "2026-07-23T10:00:02.000Z",
      settledAt: "2026-07-23T10:00:32.000Z", modelEvidence: {
        status: "recorded" as const, modelId: "Z-model", providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:02.000Z",
      },
    };
    const underscoreModel = {
      ...directEvidence, evidenceId: "direct-underscore", startedAt: "2026-07-23T10:00:03.000Z",
      settledAt: "2026-07-23T10:00:33.000Z", modelEvidence: {
        status: "recorded" as const, modelId: "_model", providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:03.000Z",
      },
    };
    const asciiModel = {
      ...directEvidence, evidenceId: "direct-ascii", startedAt: "2026-07-23T10:00:04.000Z",
      settledAt: "2026-07-23T10:00:34.000Z", modelEvidence: {
        status: "recorded" as const, modelId: "ascii-model", providerId: null,
        instrumentationSource: "trusted-pi-fixture/v1", observedAt: "2026-07-23T10:00:04.000Z",
      },
    };
    const trustedContext: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: (actionId) => actionId === "continue-implementing",
      isTrustedDirectInstrumentation: () => true,
    };
    const orderingDeps = {
      context: trustedContext,
      resolveFeature: vi.fn(async () => ({
        projectId: "project-public",
        receiptProjectId: "/workspace/project",
        cardKey: "feature:FEAT-TEST",
        phases: [phase("pending-contract", 1, "PENDING"), phase(null, 2, "COMPLETED"), phase("delivery-contract", 3, "COMPLETED")],
      })),
      orchestratedStore: {
        listFeatureInvocations: vi.fn(() => ({ ok: true, value: [evidence] })),
      },
      directHostStore: {
        listFeatureEvidence: vi.fn(() => ({
          ok: true,
          value: [asciiModel, zModel, aUmlautModel, ZModel, underscoreModel],
        })),
      },
    };

    const result = await readFeatureRuntimeEvidence({ projectId: "project-public", cardKey: "feature:FEAT-TEST" }, orderingDeps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // UTF-16 code-unit order: Z (0x5A), _ (0x5F), a (0x61), z (0x7A), ä (0xE4)
    // Z-model, _model, ascii-model (starts with 'a'), z-model, ä-model
    const actualModels = result.value.phases[2]!.directModelEvidence.map((m) => m.status === "recorded" ? m.modelId : "not_recorded");
    expect(actualModels).toEqual(["Z-model", "_model", "ascii-model", "z-model", "ä-model"]);
  });

  it("rejects malformed requests and cursors before feature or store work", async () => {
    const deps = dependencies();
    expect(await readFeatureRuntimeEvidence(null, deps)).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_INVALID_REQUEST" });
    expect(await readPhaseRuntimeEvidence({
      projectId: "project-public", cardKey: "feature:FEAT-TEST", phaseExecutionContractId: "delivery-contract", cursor: "not-a-closed-cursor", limit: 32,
    }, deps)).toEqual({ ok: false, code: "RUNTIME_EVIDENCE_INVALID_CURSOR" });
    expect(deps.resolveFeature).not.toHaveBeenCalled();
    expect(deps.orchestratedStore.listFeatureInvocations).not.toHaveBeenCalled();
    expect(deps.directHostStore.listFeatureEvidence).not.toHaveBeenCalled();
  });

  it("binds direct writes to current project, feature, phase, number, and task membership", async () => {
    const folderPath = mkdtempSync(join(tmpdir(), "hepha-direct-target-"));
    const phase3Path = join(folderPath, "phase-3.md");
    const phase4Path = join(folderPath, "phase-4.md");
    writeFileSync(phase3Path, "# Phase 3\n\n## Phase Task Ledger\n\n- [ ] [contract:task-current] current task\n");
    writeFileSync(phase4Path, "# Phase 4\n\n## Phase Task Ledger\n\n- [ ] [contract:task-foreign] foreign task\n");
    writeFileSync(join(folderPath, "PhaseExecutionContract.json"), JSON.stringify({
      schemaVersion: "hepha-phase-execution/v3",
      phases: [
        { id: "delivery-contract", order: 3, document: "Phases/phase-3.md", role: "integration", tasks: [{ id: "task-current", kind: "agent", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "focused", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
        { id: "phase-1", order: 0, document: "Phases/phase-0.md", role: "integration", tasks: [{ id: "task-early", kind: "agent", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "focused", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
        { id: "phase-2", order: 1, document: "Phases/phase-1.md", role: "integration", tasks: [{ id: "task-mid", kind: "agent", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "focused", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
        { id: "phase-pre", order: 2, document: "Phases/phase-2.md", role: "integration", tasks: [{ id: "task-prior", kind: "agent", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "focused", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
        { id: "foreign-contract", order: 4, document: "Phases/phase-4.md", role: "integration", tasks: [{ id: "task-foreign", kind: "agent", required: true }], developmentValidation: "focused", codeReview: "never", finalValidation: "focused", failurePolicy: "repair_and_rerun", gitCheckpoint: "commit_and_push" },
      ],
    }));
    writeFileSync(join(folderPath, "phase-0.md"), "# Phase 0\n\n## Phase Task Ledger\n\n- [x] placeholder\n");
    writeFileSync(join(folderPath, "phase-1.md"), "# Phase 1\n\n## Phase Task Ledger\n\n- [x] placeholder\n");
    writeFileSync(join(folderPath, "phase-2.md"), "# Phase 2\n\n## Phase Task Ledger\n\n- [x] placeholder\n");
    const store = DirectHostRuntimeEvidenceStore.createInMemory(context);
    try {
      const project = { id: "project-public", rootPath: "/workspace/project" };
      const applications = createRuntimeEvidenceApplications({
        context,
        directHostStore: store,
        orchestratedStore: { listFeatureInvocations: vi.fn(() => ({ ok: true as const, value: [] })) },
        projects: { get: vi.fn((projectId: string) => projectId === project.id ? project as never : undefined) },
        workItems: { scan: vi.fn(async () => [{
          externalId: "FEAT-TEST",
          kind: "feature",
          folderPath,
          phases: [
            { ...phase("delivery-contract", 3, "IN_PROGRESS"), documentPath: phase3Path },
            { ...phase("foreign-contract", 4, "IN_PROGRESS"), documentPath: phase4Path },
          ],
        }] as never) },
      });
      const base = { ...directEvidence, taskId: null };
      const valid = [
        { ...base, evidenceId: "direct-project", cardKey: null, phaseExecutionContractId: null, phaseNumber: null },
        { ...base, evidenceId: "direct-feature", phaseExecutionContractId: null, phaseNumber: null },
        { ...base, evidenceId: "direct-phase" },
        { ...base, evidenceId: "direct-task", taskId: "task-current" },
      ];
      for (const candidate of valid) await expect(applications.recordDirect(candidate)).resolves.toMatchObject({ ok: true, value: candidate });
      await expect(applications.recordDirect(valid[3])).resolves.toMatchObject({ ok: true, value: valid[3] });

      const invalid = [
        { ...base, evidenceId: "bad-project", projectId: "missing" },
        { ...base, evidenceId: "bad-card", cardKey: "feature:FOREIGN" },
        { ...base, evidenceId: "bad-phase", phaseExecutionContractId: "unknown-contract" },
        { ...base, evidenceId: "bad-number", phaseNumber: 999 },
        { ...base, evidenceId: "bad-task", taskId: "unknown-task" },
        { ...base, evidenceId: "foreign-task", taskId: "task-foreign" },
        { ...base, evidenceId: "split-phase", phaseExecutionContractId: null },
        { ...base, evidenceId: "task-without-phase", phaseExecutionContractId: null, phaseNumber: null, taskId: "task-current" },
      ];
      for (const candidate of invalid) await expect(applications.recordDirect(candidate)).resolves.toMatchObject({ ok: false });
      expect(store.listFeatureEvidence({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-public", cardKey: "feature:FEAT-TEST", limit: 256 }))
        .toMatchObject({ ok: true, value: [{ evidenceId: "direct-feature" }, { evidenceId: "direct-phase" }, { evidenceId: "direct-task" }] });
      expect(store.listFeatureEvidence({ schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION, projectId: "project-public", cardKey: null, limit: 256 }))
        .toMatchObject({ ok: true, value: [{ evidenceId: "direct-project" }] });
    } finally {
      store.close();
      rmSync(folderPath, { recursive: true, force: true });
    }
  });

  it("composes public project/card identity into receipt-scoped runtime evidence reads", async () => {
    const project = { id: "project-public", rootPath: "/workspace/project" };
    const listFeatureInvocations = vi.fn(() => ({ ok: true as const, value: [evidence] }));
    const applications = createRuntimeEvidenceApplications({
      context,
      directHostStore: { append: vi.fn(), listFeatureEvidence: vi.fn(() => ({ ok: true as const, value: [] })) },
      projects: { get: vi.fn((projectId: string) => projectId === project.id ? project as never : undefined) },
      orchestratedStore: { listFeatureInvocations },
      workItems: {
        scan: vi.fn(async () => [{
          externalId: "FEAT-TEST",
          kind: "feature",
          phases: [phase("delivery-contract", 3, "COMPLETED")],
        }] as never),
      },
    });

    const result = await applications.readFeature({ projectId: project.id, cardKey: "feature:FEAT-TEST" });

    expect(result).toMatchObject({ ok: true, value: { projectId: "project-public", cardKey: "feature:FEAT-TEST" } });
    expect(listFeatureInvocations).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "/workspace/project",
      cardKey: "feature:FEAT-TEST",
    }));
    await expect(applications.readPhase({
      projectId: project.id,
      cardKey: "feature:FEAT-TEST",
      phaseExecutionContractId: "delivery-contract",
      cursor: null,
      limit: 10,
    })).resolves.toMatchObject({ ok: true, value: { phaseExecutionContractId: "delivery-contract", executions: [{ mode: "orchestrated", invocationId: "invocation-1" }] } });
    await expect(applications.readFeature({ projectId: "missing", cardKey: "feature:FEAT-TEST" }))
      .resolves.toEqual({ ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND" });
  });
});
