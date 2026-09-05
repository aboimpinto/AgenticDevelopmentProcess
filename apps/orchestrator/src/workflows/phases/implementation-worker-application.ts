import { isHandoffPlanV1, type AgentActionId, type HandoffPlanV1, type WorkItemCard } from "@hepha/shared";
import type { PiJsonEvent } from "../../runtime/pi/pi-event-parser.js";
import type { HephaFeatureWorkflowNode } from "../../feature-workflow-spec.js";
import type { StoredProject } from "../../projects/stored-project.js";

export interface WorkerToolProfile {
  profileId: string;
  category: string;
  selectionSource: "workflow-node" | "agent-role-default" | "fallback";
  selectionReason: string;
}

export interface ImplementationWorkerPromptOptions {
  cwd: string;
  implementationProfile: true;
  maxRuntimeMs?: number | null;
  mcpProfile?: true;
  onPiEvent?: (event: PiJsonEvent) => void;
  sessionFile: string;
  stallTimeoutMs?: number;
  timeoutLabel?: string;
  timeoutMs?: number;
  workflowRunId: string;
  runtimeContext: {
    cardKey: string | null;
    phaseExecutionContractId: string | null;
    phaseNumber: number | null;
    taskId: string | null;
    selectedLessonIds: readonly string[];
  };
}

export interface ImplementationWorkerInput {
  /** Explicit orchestrated action authority supplied by the launch-bearing caller. */
  agentAction: AgentActionId;
  agentName: string;
  agentRole: string;
  cardKey: string;
  feature: WorkItemCard;
  plan: HandoffPlanV1;
  node?: HephaFeatureWorkflowNode;
  phaseExecutionContractId?: string | null;
  phaseNumber: number | null;
  phaseTitle: string | null;
  taskId?: string | null;
  project: StoredProject;
  prompt: string;
  runId: string;
  step: string;
  maxRuntimeMs?: number | null;
  mcpProfile?: true;
  onPiEvent?: (event: PiJsonEvent) => void;
  stallTimeoutMs?: number;
  timeoutLabel?: string;
  timeoutMs?: number;
  selectedProfile?: WorkerToolProfile;
  selectedLessonIds?: readonly string[];
}

/** Owns one synchronous implementation-worker lifecycle from validation through durable terminal telemetry. */
export class ImplementationWorkerApplication {
  constructor(private readonly dependencies: {
    appendAudit: (input: { agent: string; event: "pi_attempt_started" | "pi_attempt_finished"; model: string; phaseNumber: number | null; phaseTitle: string | null; project: StoredProject; runId: string; status: string }) => void;
    appendProfile: (summary: string, profile: WorkerToolProfile) => string;
    assertRunActive: (runId: string) => void;
    buildSessionFile: (input: { agentRole: string; agentRunId: string; runId: string }) => string;
    createId: () => string;
    formatFailure: (input: { agentName: string; agentRole: string; error: unknown; modelContext: string }) => string;
    isCancelled: (error: unknown) => boolean;
    recordAgentRun: (input: {
      agentName: string; agentRole: string; cardKey: string; currentStep: string; error?: string;
      id: string; model: string; phaseNumber: number | null; phaseTitle: string | null; projectId: string;
      status: "running" | "completed" | "failed"; summary: string; workflowRunId: string;
    }) => Promise<void>;
    runPrompt: (prompt: string, plan: HandoffPlanV1, options: ImplementationWorkerPromptOptions) => Promise<string>;
    runNestedPrompt?: (actionId: AgentActionId, prompt: string, plan: HandoffPlanV1, options: ImplementationWorkerPromptOptions) => Promise<string>;
    summarizeOutput: (output: string, fallback: string) => string;
    validateActionPlan: (actionId: AgentActionId, plan: HandoffPlanV1) => boolean;
    validateNodeSkill: (node: HephaFeatureWorkflowNode, projectRoot: string) => { status: string; blockedMessage?: string };
  }) {}

  async execute(input: ImplementationWorkerInput): Promise<string> {
    return await this.executeWorker(input, null);
  }

  async executeNested(actionId: AgentActionId, input: ImplementationWorkerInput): Promise<string> {
    if (!this.dependencies.runNestedPrompt) throw new Error("RUNTIME_NESTED_DISPATCH_UNAVAILABLE");
    return await this.executeWorker(input, actionId);
  }

  private async executeWorker(input: ImplementationWorkerInput, nestedActionId: AgentActionId | null): Promise<string> {
    const declaredAction = nestedActionId ?? input.agentAction;
    if (!isHandoffPlanV1(input.plan)) throw new Error("RUNTIME_INVALID_PLAN");
    if (!this.dependencies.validateActionPlan(declaredAction, input.plan)) {
      throw new Error("AGENT_ACTION_UNKNOWN");
    }
    if (input.agentAction !== declaredAction || input.plan.resolvedRoute.action.actionId !== declaredAction) {
      throw new Error("AGENT_ACTION_CONFLICT");
    }
    if (input.node && (input.node.kind !== "prompt" || input.node.agentAction !== declaredAction)) {
      throw new Error("AGENT_ACTION_CONFLICT");
    }
    const id = `agent-${this.dependencies.createId()}`;
    // This is the model in the immutable orchestrator command plan. Runtime
    // evidence separately records the model actually observed after spawn,
    // including any fallback route.
    const modelName = input.plan.resolvedRoute.route.modelId;
    if (input.node?.skill) {
      const validation = this.dependencies.validateNodeSkill(input.node, input.project.rootPath);
      if (validation.status === "blocked") {
        const error = `[FEAT-047] Skill contract validation blocked: ${validation.blockedMessage}`;
        await this.record(input, id, modelName, "failed", `${input.agentName} blocked by skill contract validation.`, error).catch(() => undefined);
        throw new Error(error);
      }
    }

    const runningSummary = input.selectedProfile ? this.dependencies.appendProfile(input.step, input.selectedProfile) : input.step;
    await this.record(input, id, modelName, "running", runningSummary);
    try {
      this.dependencies.assertRunActive(input.runId);
      this.audit(input, modelName, "pi_attempt_started", "running");
      const promptOptions: ImplementationWorkerPromptOptions = {
        cwd: input.project.rootPath, implementationProfile: true,
        sessionFile: this.dependencies.buildSessionFile({ agentRole: input.agentRole, agentRunId: id, runId: input.runId }),
        // Fixer agents (resolve-review-findings): no hard timeout, only stall detection
        ...(input.agentAction === "resolve-review-findings" ? { maxRuntimeMs: null as null, stallTimeoutMs: 600000 } : {}),
        ...(input.maxRuntimeMs !== undefined ? { maxRuntimeMs: input.maxRuntimeMs } : {}),
        ...(input.mcpProfile ? { mcpProfile: true as const } : {}),
        ...(input.onPiEvent ? { onPiEvent: input.onPiEvent } : {}),
        ...(input.stallTimeoutMs !== undefined ? { stallTimeoutMs: input.stallTimeoutMs } : {}),
        ...(input.timeoutLabel ? { timeoutLabel: input.timeoutLabel } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        workflowRunId: input.runId,
        runtimeContext: {
          cardKey: input.cardKey,
          phaseExecutionContractId: input.phaseExecutionContractId ?? null,
          phaseNumber: input.phaseExecutionContractId ? input.phaseNumber : null,
          taskId: input.taskId ?? null,
          selectedLessonIds: [...new Set(input.selectedLessonIds ?? [])].sort(),
        },
      };
      const output = nestedActionId === null
        ? await this.dependencies.runPrompt(input.prompt, input.plan, promptOptions)
        : await this.dependencies.runNestedPrompt!(nestedActionId, input.prompt, input.plan, promptOptions);
      this.audit(input, modelName, "pi_attempt_finished", "completed");
      const baseSummary = this.dependencies.summarizeOutput(output, `${input.agentName} completed.`);
      await this.record(input, id, modelName, "completed", input.selectedProfile
        ? this.dependencies.appendProfile(baseSummary, input.selectedProfile) : baseSummary);
      return output;
    } catch (error) {
      this.audit(input, modelName, "pi_attempt_finished", this.dependencies.isCancelled(error) ? "cancelled" : "failed");
      if (this.dependencies.isCancelled(error)) throw error;
      const message = this.dependencies.formatFailure({
        agentName: input.agentName, agentRole: input.agentRole, error,
        modelContext: "plan-bound runtime",
      });
      await this.record(input, id, modelName, "failed", `${input.agentName} failed.`, message).catch(() => undefined);
      throw new Error(message);
    }
  }

  private audit(input: ImplementationWorkerInput, model: string, event: "pi_attempt_started" | "pi_attempt_finished", status: string) {
    this.dependencies.appendAudit({ agent: input.agentName, event, model, phaseNumber: input.phaseNumber,
      phaseTitle: input.phaseTitle, project: input.project, runId: input.runId, status });
  }

  private record(input: ImplementationWorkerInput, id: string, model: string, status: "running" | "completed" | "failed", summary: string, error?: string) {
    return this.dependencies.recordAgentRun({ agentName: input.agentName, agentRole: input.agentRole,
      cardKey: input.cardKey, currentStep: input.step, ...(error ? { error } : {}), id, model,
      phaseNumber: input.phaseNumber, phaseTitle: input.phaseTitle, projectId: input.project.id,
      status, summary, workflowRunId: input.runId });
  }
}
