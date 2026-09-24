import { resolve } from "node:path";
import { loadPhaseGateRecord, retainPhaseGateBaseline, admitPhaseGateBaseline } from "../../exchanges/phase-gates-repository.js";
import { firstPhaseGateRepair, gateExchangePrompt, mcpGateExchangeContext, gateRevisionProblem, observePhaseGateTools, phaseGateProgressKey } from "./compatibility-phase-gate-repair.js";
import type {
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  HandoffPlanV1,
  ProjectSummary,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import {
  getNumberedPhases,
  isImplementationPhaseResolved,
} from "../phases/phase-lifecycle-policy.js";
import {
  createDevCycleMcpCompatibilityRequest,
  renderDevCycleMcpCompatibilityPrompt,
} from "./devcycle-mcp-compatibility-request.js";
import type { FeatureRecipeOperation } from "./feature-recipe-source-policy.js";
import { hasCompatibilityProgress, readCompatibilityProgress } from "./compatibility-lifecycle-state.js";
import { compatibilityRecoveryKind } from "./compatibility-lifecycle-recovery-policy.js";
import { CompatibilityImplementationRecovery, uniqueCompatibilityFeature } from "./compatibility-implementation-recovery.js";
import { isUnresolvedQualityGate } from "@hepha/shared";

interface CompatibilityTarget {
  readonly feature: WorkItemCard;
  readonly project: StoredProject;
}

interface CompatibilityMetadataInput {
  readonly cardKey: string;
  readonly command: ReturnType<typeof createDevCycleMcpCompatibilityRequest>["command"];
  readonly projectId: string;
  readonly runId: string;
}

interface CompatibilityArtifactValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly path: string;
  }>;
}

export interface DevCycleMcpCompatibilityDependencies {
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly applyManualTestDeferrals: (input: {
    readonly cardKey: string;
    readonly feature: WorkItemCard;
    readonly output: string;
    readonly project: StoredProject;
    readonly runId: string;
  }) => Promise<number>;
  readonly createId: () => string;
  readonly metadata: {
    block(input: CompatibilityMetadataInput & {
      readonly currentNodeId: string;
      readonly currentStep: string;
      readonly summary: string;
    }): Promise<void>;
    complete(input: CompatibilityMetadataInput & { readonly summary: string }): Promise<void>;
    fail(input: CompatibilityMetadataInput & { readonly error: string; readonly summary: string }): Promise<void>;
    start(input: CompatibilityMetadataInput & { readonly currentNodeId?: string; readonly currentStep: string; readonly summary: string }): Promise<void>;
  };
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly resolvePlan: (actionId: ReturnType<typeof createDevCycleMcpCompatibilityRequest>["agentAction"]) => HandoffPlanV1;
  readonly resolveTarget: (input: FeatureWorkflowActionInput) => Promise<CompatibilityTarget>;
  readonly runWorker: (input: ImplementationWorkerInput) => Promise<string>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly seedManualTestSkips: (input: {
    readonly cardKey: string;
    readonly feature: WorkItemCard;
    readonly project: StoredProject;
    readonly runId: string;
  }) => Promise<number>;
  readonly summarizeOutput: (output: string, fallback: string) => string;
  readonly summarizeProject: (project: StoredProject) => ProjectSummary;
  readonly validateImplementationArtifacts: (featureFolderPath: string) => CompatibilityArtifactValidationResult;
  readonly validateRefinementArtifacts: (featureFolderPath: string) => CompatibilityArtifactValidationResult;
  readonly validateCompletedArtifacts: (featureFolderPath: string) => CompatibilityArtifactValidationResult;
  readonly reconcileImplementationState: (feature: WorkItemCard) => void;
  readonly isWorkflowActive: (input: CompatibilityMetadataInput) => Promise<boolean>;
}

import { featureDesignPrerequisite } from "../../application/features/feature-design-prerequisite.js";

/** Owns lifecycle continuation across bounded provider sessions under one durable user workflow. */
export class DevCycleMcpCompatibilityApplication {
  constructor(private readonly dependencies: DevCycleMcpCompatibilityDependencies) {}

  async start(
    operation: FeatureRecipeOperation,
    input: FeatureWorkflowActionInput,
  ): Promise<FeatureWorkflowActionResponse> {
    const target = await this.dependencies.resolveTarget(input);
    if (target.feature.featureWorkflow?.activeRun?.status === "running") {
      throw new Error(`${target.feature.externalId} already has a running ${target.feature.featureWorkflow.activeRun.command} workflow.`);
    }
    this.assertOperationArtifacts(operation, target.feature, true);
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous: input.autonomous === true,
      featureId: target.feature.externalId,
      featurePath: target.feature.folderPath,
      operation,
    });
    const runId = `workflow-${this.dependencies.createId()}`;
    const cardKey = this.dependencies.createCardKey(target.feature.kind, target.feature.externalId);
    const metadata = { cardKey, command: request.command, projectId: target.project.id, runId } as const;
    await this.dependencies.metadata.start({
      ...metadata,
      currentStep: `Calling ${request.toolName} through DevCycle MCP`,
      summary: `Starting ${operation} with recipe source devcycle-mcp.`,
    });
    void this.execute({ cardKey, request, runId, target });
    this.dependencies.notifyChanged(target.project.id, "workflow.started", target.feature.externalId);
    return {
      filesChanged: [],
      filesCreated: [],
      items: await this.dependencies.scanProject(target.project),
      project: this.dependencies.summarizeProject(target.project),
      summary: `DevCycle MCP compatibility workflow started for ${target.feature.externalId}.`,
    };
  }

  async execute(input: {
    readonly cardKey: string;
    readonly request: ReturnType<typeof createDevCycleMcpCompatibilityRequest>;
    readonly runId: string;
    readonly target: CompatibilityTarget;
  }): Promise<void> {
    const { feature, project } = input.target;
    const metadata = {
      cardKey: input.cardKey,
      command: input.request.command,
      projectId: project.id,
      runId: input.runId,
    } as const;
    try {
      if (isImplementationOperation(input.request.operation)) {
        await this.executeImplementation(input, metadata);
        return;
      }
      const phase = selectExecutionPhase(input.request.operation, feature);
      const plan = this.dependencies.resolvePlan(input.request.agentAction);
      const refinementDiagnostics = input.request.operation === "refineFeature"
        ? this.formatArtifactDiagnostics(this.dependencies.validateRefinementArtifacts(feature.folderPath))
        : [];
      const output = await this.dependencies.runWorker({
        agentAction: input.request.agentAction,
        agentName: "DevCycle MCP Compatibility Agent",
        agentRole: "devcycle-mcp-compatibility",
        cardKey: input.cardKey,
        feature,
        mcpProfile: true,
        phaseNumber: phase?.number ?? null,
        phaseTitle: phase?.title ?? null,
        plan,
        project,
        prompt: renderDevCycleMcpCompatibilityPrompt(input.request, refinementDiagnostics),
        runId: input.runId,
        step: `Executing ${input.request.toolName} from DevCycle MCP`,
      });
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      const deferredManualTests = await this.dependencies.applyManualTestDeferrals({
        cardKey: input.cardKey,
        feature,
        output,
        project,
        runId: input.runId,
      });
      const summary = [
        this.dependencies.summarizeOutput(
          output,
          `${input.request.toolName} completed through DevCycle MCP.`,
        ),
        deferredManualTests > 0
          ? `Hepha recorded ${deferredManualTests} task(s) as SKIPPED with mandatory Manual TestPack obligations.`
          : "",
      ].filter(Boolean).join(" ");
      const refreshed = (await this.dependencies.scanProject(project))
        .find((candidate) => candidate.externalId === feature.externalId);
      if (input.request.operation === "refineFeature") {
        if (refreshed?.stateFolder !== "02_READY_TO_DEVELOP") {
          await this.dependencies.metadata.block({
            ...metadata,
            currentNodeId: "evaluate-result",
            currentStep: "Waiting for FEAT Deep-Dive answers",
            summary,
          });
          this.dependencies.notifyChanged(project.id, "workflow.blocked", feature.externalId);
          return;
        }
        this.assertValidArtifacts(
          "Refinement",
          this.dependencies.validateRefinementArtifacts(refreshed.folderPath),
        );
      }
      await this.dependencies.metadata.complete({ ...metadata, summary });
      this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
    } catch (error) {
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      const message = error instanceof Error ? error.message : "Unknown DevCycle MCP compatibility failure.";
      await this.dependencies.metadata.fail({
        ...metadata,
        error: message,
        summary: `DevCycle MCP compatibility failed while executing ${input.request.toolName}: ${message}`,
      }).catch(() => undefined);
      this.dependencies.notifyChanged(project.id, "workflow.failed", feature.externalId);
    }
  }

  private async executeImplementation(
    input: { readonly cardKey: string; readonly request: ReturnType<typeof createDevCycleMcpCompatibilityRequest>; readonly runId: string; readonly target: CompatibilityTarget },
    metadata: CompatibilityMetadataInput,
  ): Promise<void> {
    const { project } = input.target;
    let feature = input.target.feature;
    let operation = input.request.operation;
    const autonomous = input.request.arguments.workflow_mode === "autonomous";
    const initial = readCompatibilityProgress(feature);
    const supervisedPhase = selectExecutionPhase(operation, feature)?.number;
    let highWater = initial;
    let noProgressReturns = 0;
    const recovery = new CompatibilityImplementationRecovery(this.dependencies);

    if (operation === "continueImplementing") {
      feature = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
      const repaired = await recovery.recover(feature, project, metadata);
      if (!repaired) return;
      feature = repaired;
    }

    const gateRepaired = await this.repairPhaseGates(metadata, feature, project);
    if (!gateRepaired) return;
    feature = gateRepaired;
    if (operation === "continueImplementing" && initial.phaseCount > 0 && initial.resolved.size === initial.phaseCount) {
      if (!autonomous) {
        await this.blockImplementation(metadata, feature, "IMPLEMENTATION_BOUNDARY_REACHED: All phases are resolved; feature finalization requires an explicit action.");
        return;
      }
      operation = "completeFeature";
    }

    while (await this.dependencies.isWorkflowActive(metadata)) {
      this.assertOperationArtifacts(operation, feature);
      this.dependencies.reconcileImplementationState(feature);
      if (operation === "startImplementing") {
        await this.dependencies.seedManualTestSkips({ cardKey: input.cardKey, feature, project, runId: input.runId });
      }
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      // Per-session work is bounded independently of the user's whole-workflow authority.
      const request = createDevCycleMcpCompatibilityRequest({
        autonomous: false, operation, featureId: feature.externalId, featurePath: feature.folderPath,
      });
      const phase = selectExecutionPhase(operation, feature);
      const observations = resolve(project.rootPath, ".hepha", "phase-evidence", `${metadata.runId}.jsonl`);
      const previousGates = phase?.documentPath ? retainPhaseGateBaseline(phase.documentPath) : null;
      const output = await this.dependencies.runWorker({
        agentAction: request.agentAction, agentName: "DevCycle MCP Compatibility Agent",
        agentRole: "devcycle-mcp-compatibility", cardKey: input.cardKey, feature, mcpProfile: true,
        phaseNumber: phase?.number ?? null, phaseTitle: phase?.title ?? null,
        plan: this.dependencies.resolvePlan(request.agentAction), project,
        onPiEvent: observePhaseGateTools(observations),
        prompt: renderDevCycleMcpCompatibilityPrompt(request) + (phase ? mcpGateExchangeContext(phase.documentPath, observations) : "") + (operation === "completeFeature"
          ? "\nHEPHA verified that all implementation phases are resolved. Execute final verification and feature finalization only. Project canonical COMPLETED status when moving to the completed folder; do not claim success if finalization remains unfinished."
          : "\nHEPHA owns the outer workflow. Execute only this single phase and its review/acceptance, then return. Do not activate a later phase or finalize the feature from a phase session. Preserve canonical FeatureTasks status IN_PROGRESS (folder names are storage paths). If a real task/gate blocks work, persist BLOCKED in both phase projections and report the evidence. A session yield is not feature completion."),
        runId: input.runId, step: `Executing ${request.toolName} from DevCycle MCP`,
      });
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      const refreshed = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      feature = refreshed;
      await this.dependencies.applyManualTestDeferrals({ cardKey: input.cardKey, feature, output, project, runId: input.runId });
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      const repaired = await recovery.recover(feature, project, metadata, operation === "startImplementing");
      if (!repaired) return;
      feature = repaired;
      const terminal = feature.stateFolder === "04_COMPLETED";
      if (!terminal && feature.stateFolder !== "03_IN_PROGRESS") throw new Error("COMPATIBILITY_STATE_CONFLICT: Worker did not produce the In Progress folder.");
      this.assertValidArtifacts(terminal ? "Completed" : "Implementation", terminal
        ? this.dependencies.validateCompletedArtifacts(feature.folderPath)
        : this.dependencies.validateImplementationArtifacts(feature.folderPath));
      this.dependencies.reconcileImplementationState(feature);
      const summary = this.dependencies.summarizeOutput(output, "Worker session returned.");
      if (!autonomous && [...readCompatibilityProgress(feature).resolved].filter(n => !initial.resolved.has(n)).length > 1) {
        throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: Worker crossed the authorized single-phase boundary.");
      }
      const gateRepaired = await this.repairPhaseGates(metadata, feature, project, phase ? feature.phases.find(p => p.number === phase.number)?.documentPath : undefined, previousGates);
      if (!gateRepaired) return;
      feature = gateRepaired;
      const current = readCompatibilityProgress(feature);
      if ([...highWater.resolved].some(n => !current.resolved.has(n))) {
        throw new Error("COMPATIBILITY_STATE_REGRESSION: Previously resolved phases became unresolved.");
      }
      if (!autonomous && [...current.resolved].filter(n => !initial.resolved.has(n)).length > 1) {
        throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: Worker crossed the authorized single-phase boundary.");
      }
      if (terminal) {
        if (!current.phaseCount || current.resolved.size !== current.phaseCount) {
          throw new Error("COMPATIBILITY_COMPLETION_REJECTED: Terminal folder contains unfinished phases.");
        }
        if (!autonomous && input.request.operation !== "completeFeature") {
          throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: A phase session cannot finalize a supervised feature.");
        }
        if (!await this.dependencies.isWorkflowActive(metadata)) return;
        await this.dependencies.metadata.complete({ ...metadata, summary: `Feature completion verified from durable artifacts. ${summary}` });
        this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
        return;
      }
      if (current.blocked) {
        await this.blockImplementation(metadata, feature, `IMPLEMENTATION_GATE_BLOCKED: Resolve the blocked phase/task evidence before continuation. ${summary}`);
        return;
      }
      if (!autonomous && supervisedPhase !== undefined && current.resolved.has(supervisedPhase)) {
        if (!await this.dependencies.isWorkflowActive(metadata)) return;
        await this.dependencies.metadata.complete({ ...metadata, summary: `Authorized single phase completed; remaining work awaits the next user action. ${summary}` });
        this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
        return;
      }
      const progress = hasCompatibilityProgress(highWater, current);
      noProgressReturns = progress ? 0 : noProgressReturns + 1;
      highWater = { ...current, completedTasks: new Set([...highWater.completedTasks, ...current.completedTasks]) };
      if (noProgressReturns >= 2) {
        await this.blockImplementation(metadata, feature, `IMPLEMENTATION_NO_PROGRESS: Two worker sessions returned without advancing durable phase/task evidence. Remaining work is not complete. ${summary}`);
        return;
      }
      operation = current.resolved.size === current.phaseCount && current.phaseCount > 0
        ? "completeFeature" : "continueImplementing";
      if (!autonomous && operation === "completeFeature" && input.request.operation !== "completeFeature") {
        await this.blockImplementation(metadata, feature, "IMPLEMENTATION_BOUNDARY_REACHED: No unresolved phase remains; feature finalization requires an explicit action.");
        return;
      }
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      await this.dependencies.metadata.start({ ...metadata,
        currentStep: `Continuing ${operation} in a fresh worker session`,
        summary: `Worker yielded; ${current.resolved.size}/${current.phaseCount} phases resolved. ${summary}`,
      });
      this.dependencies.notifyChanged(project.id, "workflow.progress", feature.externalId);
    }
  }

  private async blockImplementation(metadata: CompatibilityMetadataInput, feature: WorkItemCard, summary: string): Promise<void> {
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    await this.dependencies.metadata.block({ ...metadata, currentNodeId: "implementation-loop", currentStep: "Implementation requires attention", summary });
    this.dependencies.notifyChanged(metadata.projectId, "workflow.blocked", feature.externalId);
  }

  private async repairPhaseGates(metadata: CompatibilityMetadataInput, initial: WorkItemCard, project: StoredProject, requiredDocumentPath?: string, originalRecord: ReturnType<typeof loadPhaseGateRecord> = null): Promise<WorkItemCard | null> {
    let feature = initial;
    const seen = new Map<string, number>();
    let revisionProblem = requiredDocumentPath ? gateRevisionProblem(originalRecord, requiredDocumentPath, project.rootPath) : null;
    const baselines = new Map<string, ReturnType<typeof loadPhaseGateRecord>>();
    if (requiredDocumentPath && originalRecord?.valid) baselines.set(requiredDocumentPath, originalRecord);
    let lastRepairSummary = "No repair attempt has completed.";
    let repairing = requiredDocumentPath ? feature.phases.find(p => p.documentPath === requiredDocumentPath) : undefined;
    while (await this.dependencies.isWorkflowActive(metadata)) {
      let gap = firstPhaseGateRepair(feature);
      if (!gap && repairing && /^(COMPLETED|SKIPPED)$/i.test(repairing.status) && !loadPhaseGateRecord(repairing.documentPath)) {
        revisionProblem = "Publish the structured phase gate record; report prose is not the gate contract.";
      }
      if (!gap && !revisionProblem) {
        if (repairing) admitPhaseGateBaseline(repairing.documentPath);
        return feature;
      }
      const phase = gap ? feature.phases.find(p => p.number === gap.phaseNumber) : repairing;
      repairing = phase;
      if (!phase) {
        await this.blockImplementation(metadata, feature, "IMPLEMENTATION_QUALITY_GATES_BLOCKED: Cannot bind unresolved gate evidence to a phase document. Repair the phase inventory.");
        return null;
      }
      const key = phaseGateProgressKey(feature, phase.documentPath, project.rootPath);
      const repeats = seen.get(key) ?? 0;
      if (repeats >= 3) {
        await this.blockImplementation(metadata, feature, `IMPLEMENTATION_QUALITY_GATES_BLOCKED: Same-phase repair made no verifiable progress after repair and cause reassessment. ${gap?.phaseTitle}: ${gap?.gates.filter(isUnresolvedQualityGate).map(g => g.justification).join("; ")}. ${revisionProblem ?? ""} Last diagnosis: ${lastRepairSummary}. Inspect the recorded attempts for the architecture, infrastructure or missing decision that needs help. No later phase was authorized.`);
        return null;
      }
      seen.set(key, repeats + 1);
      if (!baselines.has(phase.documentPath)) baselines.set(phase.documentPath, retainPhaseGateBaseline(phase.documentPath));
      const before = baselines.get(phase.documentPath) ?? null;
      const observations = resolve(project.rootPath, ".hepha", "phase-evidence", `${metadata.runId}.jsonl`);
      await this.dependencies.metadata.start({ ...metadata, currentNodeId: "implementation-loop", currentStep: "Repairing phase quality gates", summary: `Repairing ${phase.title}; ${repeats ? "reassess the cause and existing infrastructure" : "inspect existing evidence first"}.` });
      const request = createDevCycleMcpCompatibilityRequest({ autonomous: false, operation: "continueImplementing", featureId: feature.externalId, featurePath: feature.folderPath });
      const repairOutput = await this.dependencies.runWorker({ agentAction: request.agentAction, agentName: "Phase Gate Repair", agentRole: "devcycle-mcp-compatibility", cardKey: metadata.cardKey,
        feature, project, mcpProfile: true, phaseNumber: phase.number, phaseTitle: phase.title, plan: this.dependencies.resolvePlan(request.agentAction), runId: metadata.runId,
        step: "Repairing phase quality gates", onPiEvent: observePhaseGateTools(observations),
        prompt: `HEPHA owns continuation. Repair only ${phase.documentPath}, its scoped code/tests/review and evidence. Do not invoke continue-implementation to select another phase. Preserve the feature lifecycle and other phases. Existing completed status is not acceptance until gates pass.\nIssues: ${JSON.stringify(gap?.gates.filter(isUnresolvedQualityGate))}. ${revisionProblem ?? ""}\n${repeats ? "Previous repair did not improve evidence. Reassess the cause, inspect actual runner output, setup and architectural assumptions; do not repeat the same attempted fix or merely rewrite report prose." : "First reconcile existing native execution and review results; rerun only when verification is absent, failed or invalidated by changes."}` + gateExchangePrompt(phase.documentPath, observations),
      });
      if (!await this.dependencies.isWorkflowActive(metadata)) return null;
      lastRepairSummary = this.dependencies.summarizeOutput(repairOutput, "Worker returned without a cause assessment.");
      revisionProblem = gateRevisionProblem(before, phase.documentPath, project.rootPath);
      if (!loadPhaseGateRecord(phase.documentPath)) revisionProblem = "Reconcile this phase into the structured gate contract before acceptance; preserve its configured obligations and actual failures.";
      const refreshed = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
      const previous = readCompatibilityProgress(feature), current = readCompatibilityProgress(refreshed);
      if (refreshed.stateFolder !== feature.stateFolder || [...current.resolved].some(id => !previous.resolved.has(id) && id !== phase.number)) {
        throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: Gate repair advanced outside the assigned phase.");
      }
      feature = refreshed;
      this.dependencies.reconcileImplementationState(feature);
    }
    return null;
  }

  private assertOperationArtifacts(operation: FeatureRecipeOperation, feature: WorkItemCard, allowRecovery = false): void {
    if (operation === "refineFeature") {
      const blocker = featureDesignPrerequisite(feature.featureWorkflow?.uiRequirementDecision, feature.featureWorkflow?.hasDesignArtifacts ?? false);
      if (blocker) throw new Error(blocker);
    }
    if (isImplementationOperation(operation) && feature.validation?.needsValidationCount > 0) {
      throw new Error("IMPLEMENTATION_DECISIONS_UNRESOLVED: Resolve outstanding target decisions through Deep-Dive before implementation.");
    }
    if (operation === "startImplementing") {
      if (feature.stateFolder !== "02_READY_TO_DEVELOP") throw new Error("COMPATIBILITY_STATE_CONFLICT: Start requires the Ready lifecycle folder.");
      this.assertValidArtifacts(
        "Refinement",
        this.dependencies.validateRefinementArtifacts(feature.folderPath),
      );
    } else if (operation === "continueImplementing" || operation === "completeFeature") {
      if (feature.stateFolder !== "03_IN_PROGRESS") throw new Error("COMPATIBILITY_STATE_CONFLICT: Implementation requires the In Progress lifecycle folder.");
      const validation = this.dependencies.validateImplementationArtifacts(feature.folderPath);
      if (!(allowRecovery && operation === "continueImplementing" && compatibilityRecoveryKind(feature, validation) === "status")) {
        this.assertValidArtifacts("Implementation", validation);
      }
      if (operation === "completeFeature") {
        const progress = readCompatibilityProgress(feature);
        if (!progress.phaseCount || progress.resolved.size !== progress.phaseCount) {
          throw new Error("COMPATIBILITY_COMPLETION_REJECTED: Finalization requires every implementation phase to be resolved.");
        }
      }
    }
  }

  private assertValidArtifacts(label: string, result: CompatibilityArtifactValidationResult): void {
    if (result.valid) return;
    const details = this.formatArtifactDiagnostics(result).join("; ");
    throw new Error(`${label} artifacts failed DevCycle compatibility validation: ${details}`);
  }

  private formatArtifactDiagnostics(result: CompatibilityArtifactValidationResult): string[] {
    return result.errors.map((error) => `[${error.code}] ${error.path}: ${error.message}`);
  }
}

function isImplementationOperation(operation: FeatureRecipeOperation): boolean {
  return operation === "startImplementing" || operation === "continueImplementing" || operation === "completeFeature";
}

/**
 * Associates implementation telemetry with the lifecycle phase active when the
 * orchestrator dispatches the provider recipe. Phase number/title are recorded
 * only as display metadata; selection is based on unresolved lifecycle state.
 */
function selectExecutionPhase(
  operation: FeatureRecipeOperation,
  feature: Pick<WorkItemCard, "phases">,
) {
  if (operation !== "startImplementing" && operation !== "continueImplementing") return null;
  return getNumberedPhases(feature).find((phase) => !isImplementationPhaseResolved(phase)) ?? null;
}
