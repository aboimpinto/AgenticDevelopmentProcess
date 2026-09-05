import type { DirectHostRuntimeEvidenceStore, RuntimeInvocationStore } from "@hepha/db";
import type { RuntimeEvidenceGuardContextV1 } from "@hepha/shared";
import { createWorkItemCardKey } from "../application/work-items/work-item-card-key-policy.js";
import type { WorkItemQueryApplication } from "../application/work-items/work-item-query-application.js";
import {
  recordDirectHostRuntimeEvidence,
  type ResolvedTarget,
} from "../application/runtime-evidence/direct-host-runtime-evidence-application.js";
import {
  readFeatureRuntimeEvidence,
  readPhaseRuntimeEvidence,
} from "../application/runtime-evidence/runtime-evidence-application.js";
import type { ProjectRegistry } from "../projects/project-registry.js";
import { loadPhaseExecutionContract } from "../phase-execution-contract.js";
import { readPhaseTaskLedgerItems } from "../workflows/phases/phase-task-document-repository.js";

export interface RuntimeEvidenceApplicationsDependencies {
  readonly context: RuntimeEvidenceGuardContextV1;
  readonly directHostStore: Pick<DirectHostRuntimeEvidenceStore, "append" | "listFeatureEvidence">;
  readonly orchestratedStore: Pick<RuntimeInvocationStore, "listFeatureInvocations">;
  readonly projects: Pick<ProjectRegistry, "get">;
  readonly workItems: Pick<WorkItemQueryApplication, "scan">;
}

/** Composes mode-aware runtime-evidence applications with registered project/work-item identity. */
export function createRuntimeEvidenceApplications(dependencies: RuntimeEvidenceApplicationsDependencies) {
  const resolveFeature = async (projectId: string, cardKey: string) => {
    const project = dependencies.projects.get(projectId);
    if (!project) return null;
    const feature = (await dependencies.workItems.scan(project)).find((item) =>
      item.kind === "feature" && createWorkItemCardKey(item.kind, item.externalId) === cardKey,
    );
    return feature ? {
      projectId: project.id,
      receiptProjectId: project.rootPath,
      cardKey,
      phases: feature.phases,
    } : null;
  };
  const applicationDependencies = {
    context: dependencies.context,
    directHostStore: dependencies.directHostStore,
    orchestratedStore: dependencies.orchestratedStore,
    resolveFeature,
  };
  return {
    readFeature: (input: unknown) => readFeatureRuntimeEvidence(input, applicationDependencies),
    readPhase: (input: unknown) => readPhaseRuntimeEvidence(input, applicationDependencies),
    recordDirect: (input: unknown) => recordDirectHostRuntimeEvidence(input, {
      context: dependencies.context,
      store: dependencies.directHostStore,
      resolveTarget: async (target) => {
        const project = dependencies.projects.get(target.projectId);
        if (!project) return null;
        if (target.cardKey === null) {
          if (target.phaseExecutionContractId !== null || target.phaseNumber !== null || target.taskId !== null) return null;
          return { valid: true, projectId: target.projectId, cardKey: null, phaseExecutionContractId: null, phaseNumber: null, resolvedTaskIds: null } satisfies ResolvedTarget;
        }
        const features = (await dependencies.workItems.scan(project)).filter((item) =>
          item.kind === "feature" && createWorkItemCardKey(item.kind, item.externalId) === target.cardKey,
        );
        if (features.length !== 1) return null;
        const feature = features[0]!;
        if (target.phaseExecutionContractId === null) {
          if (target.phaseNumber !== null || target.taskId !== null) return null;
          return { valid: true, projectId: target.projectId, cardKey: target.cardKey, phaseExecutionContractId: null, phaseNumber: null, resolvedTaskIds: null } satisfies ResolvedTarget;
        }
        if (target.phaseNumber === null) return null;
        const phases = feature.phases.filter((phase) => phase.executionContractId === target.phaseExecutionContractId);
        if (phases.length !== 1) return null;
        if (phases[0]!.number !== target.phaseNumber) return null;
        if (target.taskId === null) {
          return { valid: true, projectId: target.projectId, cardKey: target.cardKey, phaseExecutionContractId: target.phaseExecutionContractId, phaseNumber: target.phaseNumber, resolvedTaskIds: null } satisfies ResolvedTarget;
        }
        const loaded = loadPhaseExecutionContract(feature.folderPath);
        if (!loaded.contract || loaded.diagnostics.length > 0) return null;
        const contracts = loaded.contract.phases.filter((phase) => phase.id === target.phaseExecutionContractId);
        if (contracts.length !== 1) return null;
        const contractTasks = contracts[0]!.tasks.map((task) => task.id);
        const ledgerTasks = readPhaseTaskLedgerItems(phases[0] as typeof phases[0] & { number: number }).map(
          (task) => task.id,
        );
        const resolvedTaskIds = [...new Set([...contractTasks, ...ledgerTasks])];
        if (!resolvedTaskIds.includes(target.taskId)) return null;
        return { valid: true, projectId: target.projectId, cardKey: target.cardKey, phaseExecutionContractId: target.phaseExecutionContractId, phaseNumber: target.phaseNumber, resolvedTaskIds } satisfies ResolvedTarget;
      },
    }),
  };
}
