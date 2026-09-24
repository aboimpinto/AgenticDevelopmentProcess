import { resolve } from "node:path";
import { loadPhaseGateRecord, retainPhaseGateBaseline, admitPhaseGateBaseline, readPhaseGates } from "../../exchanges/phase-gates-repository.js";
import { firstPhaseGateRepair, mcpGateExchangeContext, gateRevisionProblem, observePhaseGateTools } from "./compatibility-phase-gate-repair.js";
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
import { readCompatibilityProgress } from "./compatibility-lifecycle-state.js";
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

/** Launches one MCP action, observes Pi, then admits its durable result. */
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
        if (refreshed?.stateFolder !== "02_READY_TO_DEVELOP" || refreshed.validation?.needsValidationCount > 0) {
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
    const operation = input.request.operation;
    const autonomous = input.request.arguments.workflow_mode === "autonomous";
    const recovery = new CompatibilityImplementationRecovery(this.dependencies);
    if (operation === "continueImplementing") {
      feature = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
      // A recognized header mismatch is deterministic bookkeeping, not a Pi turn.
      const repaired = await recovery.recover(feature, project, metadata);
      if (!repaired) return;
      feature = repaired;
    }
    this.assertOperationArtifacts(operation, feature);
    this.dependencies.reconcileImplementationState(feature);
    const initial = readCompatibilityProgress(feature);
    const initialPhases = getNumberedPhases(feature);
    const gap = firstPhaseGateRepair(feature);
    const phase = (gap ? initialPhases.find(p => p.number === gap.phaseNumber) : null)
      ?? selectExecutionPhase(operation, feature);
    if (!autonomous && operation === "continueImplementing" && !phase) {
      await this.blockImplementation(metadata, feature, "IMPLEMENTATION_BOUNDARY_REACHED: No unresolved phase remains; feature finalization requires an explicit action.");
      return;
    }
    if (operation === "startImplementing") {
      await this.dependencies.seedManualTestSkips({ cardKey: input.cardKey, feature, project, runId: input.runId });
    }
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    const baselines = new Map(initialPhases.map(p => [p.number, retainPhaseGateBaseline(p.documentPath)]));
    const observations = resolve(project.rootPath, ".hepha", "phase-evidence", `${metadata.runId}.jsonl`);
    const request = createDevCycleMcpCompatibilityRequest({
      autonomous, operation, featureId: feature.externalId, featurePath: feature.folderPath,
    });
    const output = await this.dependencies.runWorker({
      agentAction: request.agentAction, agentName: "DevCycle MCP Compatibility Agent",
      agentRole: "devcycle-mcp-compatibility", cardKey: input.cardKey, feature, mcpProfile: true,
      phaseNumber: phase?.number ?? null, phaseTitle: phase?.title ?? null,
      plan: this.dependencies.resolvePlan(request.agentAction), project,
      onPiEvent: observePhaseGateTools(observations),
      prompt: renderDevCycleMcpCompatibilityPrompt(request)
        + (phase ? mcpGateExchangeContext(phase.documentPath, observations) : `\nHost shell observation ledger: ${observations}`)
        + (gap ? `\nCurrent artifact diagnostics: ${JSON.stringify(gap.gates.filter(isUnresolvedQualityGate))}` : ""),
      runId: input.runId, step: `Executing ${request.toolName} from DevCycle MCP`,
    });
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    feature = uniqueCompatibilityFeature(await this.dependencies.scanProject(project), feature.externalId);
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    await this.dependencies.applyManualTestDeferrals({ cardKey: input.cardKey, feature, output, project, runId: input.runId });
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    // Never launch a repair or continuation session after the requested action.
    const repaired = await recovery.recover(feature, project, metadata);
    if (!repaired) return;
    feature = repaired;
    const terminal = feature.stateFolder === "04_COMPLETED";
    if (!terminal && feature.stateFolder !== "03_IN_PROGRESS") throw new Error("COMPATIBILITY_STATE_CONFLICT: Worker did not produce the In Progress folder.");
    this.assertValidArtifacts(terminal ? "Completed" : "Implementation", terminal
      ? this.dependencies.validateCompletedArtifacts(feature.folderPath)
      : this.dependencies.validateImplementationArtifacts(feature.folderPath));
    this.dependencies.reconcileImplementationState(feature);
    const current = readCompatibilityProgress(feature);
    const phases = getNumberedPhases(feature);
    if (phases.length !== initialPhases.length || initialPhases.some(p => !phases.some(q => q.number === p.number))) {
      throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: The worker changed the approved phase inventory.");
    }
    if ([...initial.resolved].some(n => !current.resolved.has(n))) {
      throw new Error("COMPATIBILITY_STATE_REGRESSION: Previously resolved phases became unresolved.");
    }
    if (!autonomous && operation !== "completeFeature" && (terminal || phases.some(p =>
      p.number !== phase?.number && (p.status !== initialPhases.find(q => q.number === p.number)?.status
        || (!initial.resolved.has(p.number) && current.resolved.has(p.number)))))) {
      throw new Error("COMPATIBILITY_SCOPE_EXCEEDED: Worker crossed the authorized single-phase boundary.");
    }
    const summary = this.dependencies.summarizeOutput(output, "Pi action returned.");
    const problems: string[] = [];
    for (const p of phases) {
      const revision = gateRevisionProblem(baselines.get(p.number) ?? null, p.documentPath, project.rootPath);
      if (revision) problems.push(`${p.title}: ${revision}`);
      if (current.resolved.has(p.number) && (!initial.resolved.has(p.number) || p.number === phase?.number)
        && !loadPhaseGateRecord(p.documentPath)) problems.push(`${p.title}: Publish the structured phase gate record; report prose is not acceptance evidence.`);
      if (current.resolved.has(p.number) || p.number === phase?.number) {
        problems.push(...(readPhaseGates(p, project.rootPath) ?? []).filter(isUnresolvedQualityGate).map(g => `${p.title}: ${g.justification}`));
      }
    }
    const unresolved = firstPhaseGateRepair(feature);
    if (unresolved) problems.push(...unresolved.gates.filter(isUnresolvedQualityGate).map(g => `${unresolved.phaseTitle}: ${g.justification}`));
    if (problems.length) {
      await this.blockImplementation(metadata, feature, `IMPLEMENTATION_QUALITY_GATES_BLOCKED: Pi returned with unresolved declared evidence. ${[...new Set(problems)].join("; ")}. ${summary}`);
      return;
    }
    if (terminal && (!current.phaseCount || current.resolved.size !== current.phaseCount)) {
      throw new Error("COMPATIBILITY_COMPLETION_REJECTED: Terminal folder contains unfinished phases.");
    }
    if (terminal || (!autonomous && operation !== "completeFeature" && phase && current.resolved.has(phase.number))) {
      if (!await this.dependencies.isWorkflowActive(metadata)) return;
      for (const p of phases.filter(p => current.resolved.has(p.number))) admitPhaseGateBaseline(p.documentPath);
      await this.dependencies.metadata.complete({ ...metadata, summary: `${terminal ? "Feature completion verified from durable artifacts." : "Authorized single phase completed; remaining work awaits the next user action."} ${summary}` });
      this.dependencies.notifyChanged(project.id, "workflow.completed", feature.externalId);
      return;
    }
    await this.blockImplementation(metadata, feature, `${current.blocked ? "IMPLEMENTATION_GATE_BLOCKED" : "IMPLEMENTATION_ACTION_INCOMPLETE"}: Pi returned before the authorized action was complete. No additional worker was launched. ${summary}`);
  }

  private async blockImplementation(metadata: CompatibilityMetadataInput, feature: WorkItemCard, summary: string): Promise<void> {
    if (!await this.dependencies.isWorkflowActive(metadata)) return;
    await this.dependencies.metadata.block({ ...metadata, currentNodeId: "implementation-loop", currentStep: "Implementation requires attention", summary });
    this.dependencies.notifyChanged(metadata.projectId, "workflow.blocked", feature.externalId);
  }

  private assertOperationArtifacts(operation: FeatureRecipeOperation, feature: WorkItemCard, allowRecovery = false): void {
    if (operation === "refineFeature") {
      if (feature.validation?.needsValidationCount > 0) {
        throw new Error("REFINEMENT_DECISIONS_UNRESOLVED: Resolve outstanding target decisions through Deep-Dive before refinement.");
      }
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
