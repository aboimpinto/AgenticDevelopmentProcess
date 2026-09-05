import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvidenceGuardContextV1 } from "@hepha/shared";
import { recordDirectHostRuntimeEvidence } from "../src/application/runtime-evidence/direct-host-runtime-evidence-application.js";
import { DirectHostInstrumentationRegistry } from "../src/application/runtime-evidence/direct-host-instrumentation-registry.js";

const evidence = {
  schemaVersion: "runtime-execution/v1" as const,
  mode: "direct_host" as const,
  evidenceId: "direct-1",
  projectId: "HEPHA",
  cardKey: "feature:FEAT-071",
  phaseExecutionContractId: "evidence-projection",
  phaseNumber: 5,
  taskId: "task-1",
  procedureId: "continue-implementation",
  actionId: "continue-implementing",
  hostKind: "pi" as const,
  hostIdentity: null,
  startedAt: "2026-07-26T10:00:00.000Z",
  settledAt: "2026-07-26T10:01:00.000Z",
  durationMs: 60_000,
  outcome: "completed" as const,
  failureCode: null,
  stateSync: { status: "completed" as const, operationId: "sync-1" },
  modelEvidence: { status: "not_recorded" as const },
};

function dependencies(context: RuntimeEvidenceGuardContextV1) {
  return {
    context,
    resolveTarget: vi.fn(async () => ({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      resolvedTaskIds: ["task-1"],
    })),
    store: { append: vi.fn(() => ({ ok: true as const, value: evidence })) },
  };
}

describe("recordDirectHostRuntimeEvidence", () => {
  it("records a route-free direct state-sync result without policy or orchestrated side effects", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: (actionId) => actionId === "continue-implementing",
      isTrustedDirectInstrumentation: () => false,
    };
    const deps = dependencies(context);
    await expect(recordDirectHostRuntimeEvidence(evidence, deps)).resolves.toEqual({ ok: true, value: evidence });
    expect(deps.resolveTarget).toHaveBeenCalledWith({
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      taskId: "task-1",
    });
    expect(deps.store.append).toHaveBeenCalledWith(evidence);
  });

  it("requires explicitly registered host instrumentation before recording an actual model claim", async () => {
    const registry = new DirectHostInstrumentationRegistry([{
      hostKind: "pi", instrumentationSource: "trusted-pi-fixture/v1",
    }]);
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: (input) => registry.isTrusted(input),
    };
    const recorded = {
      ...evidence,
      modelEvidence: {
        status: "recorded" as const,
        modelId: "observed-model",
        providerId: "observed-provider",
        instrumentationSource: "trusted-pi-fixture/v1",
        observedAt: "2026-07-26T10:00:30.000Z",
      },
    };
    const accepted = dependencies(context);
    accepted.store.append.mockReturnValue({ ok: true, value: recorded });
    await expect(recordDirectHostRuntimeEvidence(recorded, accepted)).resolves.toEqual({ ok: true, value: recorded });

    const rejected = dependencies({ ...context, isTrustedDirectInstrumentation: () => false });
    await expect(recordDirectHostRuntimeEvidence(recorded, rejected)).resolves.toEqual({
      ok: false, code: "DIRECT_MODEL_PROVENANCE_REQUIRED",
    });
    expect(rejected.resolveTarget).not.toHaveBeenCalled();
    expect(rejected.store.append).not.toHaveBeenCalled();
  });

  it("rejects null/non-null phase identity pairs before persistence", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    };
    // Test case A: evidence has null phase, resolved has non-null — must reject with NOT_FOUND
    // (task must also be null because guard rejects task without phase)
    {
      const deps = dependencies(context);
      deps.resolveTarget.mockResolvedValue({
        valid: true as const,
        projectId: "HEPHA",
        cardKey: "feature:FEAT-071",
        phaseExecutionContractId: "evidence-projection",
        phaseNumber: 5,
        resolvedTaskIds: null,
      });
      const evidWithoutPhase = { ...evidence, phaseExecutionContractId: null, phaseNumber: null, taskId: null };
      await expect(recordDirectHostRuntimeEvidence(evidWithoutPhase, deps)).resolves.toEqual({
        ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
      });
      expect(deps.store.append).not.toHaveBeenCalled();
    }
    // Test case B: evidence has non-null phase, resolved has null — must reject
    {
      const deps = dependencies(context);
      deps.resolveTarget.mockResolvedValue({
        valid: true as const,
        projectId: "HEPHA",
        cardKey: "feature:FEAT-071",
        phaseExecutionContractId: null,
        phaseNumber: null,
        resolvedTaskIds: null,
      });
      const evidWithPhase = { ...evidence, taskId: null };
      await expect(recordDirectHostRuntimeEvidence(evidWithPhase, deps)).resolves.toEqual({
        ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
      });
      expect(deps.store.append).not.toHaveBeenCalled();
    }
  });

  it("rejects null or missing task membership before persistence", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    };
    const evidenceWithTask = { ...evidence, taskId: "task-1" };

    // Null resolvedTaskIds when task is non-null
    const depsNull = dependencies(context);
    depsNull.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      resolvedTaskIds: null,
    });
    await expect(recordDirectHostRuntimeEvidence(evidenceWithTask, depsNull)).resolves.toEqual({
      ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
    });
    expect(depsNull.store.append).not.toHaveBeenCalled();

    // Non-null resolvedTaskIds that does not contain task
    const depsMissing = dependencies(context);
    depsMissing.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      resolvedTaskIds: ["task-other"],
    });
    await expect(recordDirectHostRuntimeEvidence(evidenceWithTask, depsMissing)).resolves.toEqual({
      ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
    });
    expect(depsMissing.store.append).not.toHaveBeenCalled();

    // Task without phase identity must reject
    const depsNoPhase = dependencies(context);
    depsNoPhase.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: null,
      phaseNumber: null,
      resolvedTaskIds: null,
    });
    await expect(recordDirectHostRuntimeEvidence(evidenceWithTask, depsNoPhase)).resolves.toEqual({
      ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
    });
    expect(depsNoPhase.store.append).not.toHaveBeenCalled();
  });

  it("rejects mismatched resolved identity before persistence", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    };
    const mismatches: Array<{
      name: string;
      resolved: { projectId: string; cardKey: string | null; phaseExecutionContractId: string | null; phaseNumber: number | null };
    }> = [
      { name: "projectId", resolved: { projectId: "FOREIGN", cardKey: "feature:FEAT-071", phaseExecutionContractId: "evidence-projection", phaseNumber: 5 } },
      { name: "cardKey", resolved: { projectId: "HEPHA", cardKey: "feature:FOREIGN", phaseExecutionContractId: "evidence-projection", phaseNumber: 5 } },
      { name: "phaseExecutionContractId", resolved: { projectId: "HEPHA", cardKey: "feature:FEAT-071", phaseExecutionContractId: "foreign-contract", phaseNumber: 5 } },
      { name: "phaseNumber", resolved: { projectId: "HEPHA", cardKey: "feature:FEAT-071", phaseExecutionContractId: "evidence-projection", phaseNumber: 99 } },
    ];
    for (const { name: _name, resolved } of mismatches) {
      const deps = dependencies(context);
      deps.resolveTarget.mockResolvedValue({
        valid: true as const,
        projectId: resolved.projectId,
        cardKey: resolved.cardKey,
        phaseExecutionContractId: resolved.phaseExecutionContractId,
        phaseNumber: resolved.phaseNumber,
        resolvedTaskIds: ["task-1"],
      });
      await expect(recordDirectHostRuntimeEvidence(evidence, deps)).resolves.toEqual({
        ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
      });
      expect(deps.store.append).not.toHaveBeenCalled();
    }
  });

  it("records exact project-level, feature-level, phase-level, and task-level evidence exactly once each", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    };

    function depsFor() {
      return {
        context,
        resolveTarget: vi.fn(),
        store: { append: vi.fn((value: unknown) => ({ ok: true as const, value })) },
      };
    }

    // Project-level: cardKey/phase/task null, resolve returns matching nulls
    const projectTarget = { ...evidence, evidenceId: "project-only", cardKey: null, phaseExecutionContractId: null, phaseNumber: null, taskId: null };
    const projectDeps = depsFor();
    projectDeps.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: null,
      phaseExecutionContractId: null,
      phaseNumber: null,
      resolvedTaskIds: null,
    });
    await expect(recordDirectHostRuntimeEvidence(projectTarget, projectDeps)).resolves.toEqual({ ok: true, value: projectTarget });
    expect(projectDeps.store.append).toHaveBeenCalledWith(projectTarget);

    // Feature-level: cardKey set, phase/task null, resolve returns matching cardKey with null phase
    const featureTarget = { ...evidence, evidenceId: "feature-only", phaseExecutionContractId: null, phaseNumber: null, taskId: null };
    const featureDeps = depsFor();
    featureDeps.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: null,
      phaseNumber: null,
      resolvedTaskIds: null,
    });
    await expect(recordDirectHostRuntimeEvidence(featureTarget, featureDeps)).resolves.toEqual({ ok: true, value: featureTarget });
    expect(featureDeps.store.append).toHaveBeenCalledWith(featureTarget);

    // Phase-level: cardKey + phase set, task null
    const phaseTarget = { ...evidence, evidenceId: "phase-only", taskId: null };
    const phaseDeps = depsFor();
    phaseDeps.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      resolvedTaskIds: null,
    });
    await expect(recordDirectHostRuntimeEvidence(phaseTarget, phaseDeps)).resolves.toEqual({ ok: true, value: phaseTarget });
    expect(phaseDeps.store.append).toHaveBeenCalledWith(phaseTarget);

    // Task-level: all fields set, task in resolvedTaskIds
    const taskTarget = { ...evidence, evidenceId: "task-exact" };
    const taskDeps = depsFor();
    taskDeps.resolveTarget.mockResolvedValue({
      valid: true as const,
      projectId: "HEPHA",
      cardKey: "feature:FEAT-071",
      phaseExecutionContractId: "evidence-projection",
      phaseNumber: 5,
      resolvedTaskIds: ["task-1"],
    });
    await expect(recordDirectHostRuntimeEvidence(taskTarget, taskDeps)).resolves.toEqual({ ok: true, value: taskTarget });
    expect(taskDeps.store.append).toHaveBeenCalledWith(taskTarget);
  });

  it("rejects cross-mode fields and unknown targets before persistence", async () => {
    const context: RuntimeEvidenceGuardContextV1 = {
      isRegisteredAction: () => true,
      isTrustedDirectInstrumentation: () => false,
    };
    const contaminated = dependencies(context);
    await expect(recordDirectHostRuntimeEvidence({ ...evidence, revisionId: "policy-1" }, contaminated))
      .resolves.toEqual({ ok: false, code: "RUNTIME_EVIDENCE_MODE_CONFLICT" });
    expect(contaminated.store.append).not.toHaveBeenCalled();

    const missing = dependencies(context);
    missing.resolveTarget.mockResolvedValue(null);
    await expect(recordDirectHostRuntimeEvidence(evidence, missing)).resolves.toEqual({
      ok: false, code: "RUNTIME_EVIDENCE_NOT_FOUND",
    });
    expect(missing.store.append).not.toHaveBeenCalled();
  });
});
