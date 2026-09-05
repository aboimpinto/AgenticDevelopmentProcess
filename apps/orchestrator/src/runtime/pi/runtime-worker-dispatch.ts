import {
  AgentDispatchContractError,
  parseAgentDispatchEnvelopeV1,
  isHandoffPlanV1,
  type AgentActionId,
  type AgentDispatchEnvelopeV1,
  type HandoffPlanV1,
  type SerializedAgentDispatchEnvelopeV1,
} from "@hepha/shared";
import type { RuntimeAttemptContextV1, RuntimeAttemptExecutionHooks } from "./handoff-plan-executor.js";
import type { RuntimeExecutionCoordinator, RuntimeExecutionResult } from "./runtime-execution-coordinator.js";

export interface NestedRuntimeDispatchResult {
  readonly invocationId: string;
  readonly plan: HandoffPlanV1;
  readonly execution: RuntimeExecutionResult;
}

/** Admits one explicit nested dispatch envelope and executes its independently resolved plan. */
export class NestedRuntimeDispatchAdapter {
  constructor(private readonly dependencies: {
    readonly coordinator: Pick<RuntimeExecutionCoordinator, "execute">;
    readonly createId: () => string;
    readonly registeredActionIds: readonly AgentActionId[];
    readonly resolvePlan: (actionId: AgentActionId) => HandoffPlanV1;
    readonly validateActionPlan: (actionId: AgentActionId, plan: HandoffPlanV1) => boolean;
  }) {}

  async dispatch(raw: unknown): Promise<NestedRuntimeDispatchResult> {
    let input: AgentDispatchEnvelopeV1;
    try {
      input = parseAgentDispatchEnvelopeV1(raw, this.dependencies.registeredActionIds);
    } catch (error) {
      if (error instanceof AgentDispatchContractError) throw new Error(error.code);
      throw new Error("RUNTIME_INVALID_CONTEXT");
    }
    if (input.dispatchKind !== "nested") throw new Error("RUNTIME_INVALID_CONTEXT");
    return await this.dispatchResolved(input, this.dependencies.resolvePlan(input.agentAction));
  }

  async dispatchResolved(
    raw: AgentDispatchEnvelopeV1,
    plan: HandoffPlanV1,
    hooks: RuntimeAttemptExecutionHooks = {},
  ): Promise<NestedRuntimeDispatchResult> {
    const input = this.parseNormalized(raw);
    if (input.dispatchKind !== "nested" || !isHandoffPlanV1(plan)
      || plan.resolvedRoute.action.actionId !== input.agentAction
      || !this.dependencies.validateActionPlan(input.agentAction, plan)) {
      throw new Error("RUNTIME_INVALID_PLAN");
    }
    const invocationId = this.dependencies.createId();
    const context: RuntimeAttemptContextV1 = {
      projectId: input.projectId,
      cardKey: input.cardKey,
      workflowRunId: input.workflowRunId,
      workflowNodeId: input.workflowNodeId,
      phaseExecutionContractId: input.phaseExecutionContractId,
      phaseNumber: input.phaseNumber,
      taskId: input.taskId,
      correlationId: input.correlationId,
      selectedLessonIds: input.selectedLessonIds,
      invocationKind: "nested",
      rootInvocationId: input.rootInvocationId!,
      parentInvocationId: input.parentInvocationId!,
    };
    return {
      invocationId,
      plan,
      execution: await this.dependencies.coordinator.execute({
        plan,
        invocationId,
        context,
        inputRef: input.inputRef,
      }, hooks),
    };
  }

  private parseNormalized(raw: AgentDispatchEnvelopeV1): AgentDispatchEnvelopeV1 {
    if (!record(raw) || !exactKeys(raw, [
      "schemaVersion", "agentAction", "dispatchKind", "projectId", "cardKey", "workflowRunId",
      "workflowNodeId", "phaseExecutionContractId", "phaseNumber", "taskId", "correlationId",
      "inputRef", "selectedLessonIds", "rootInvocationId", "parentInvocationId",
    ])) throw new Error("RUNTIME_INVALID_PLAN");
    const serialized: SerializedAgentDispatchEnvelopeV1 = {
      schemaVersion: raw.schemaVersion,
      agent_action: raw.agentAction,
      dispatchKind: raw.dispatchKind,
      projectId: raw.projectId,
      cardKey: raw.cardKey,
      workflowRunId: raw.workflowRunId,
      workflowNodeId: raw.workflowNodeId,
      phaseExecutionContractId: raw.phaseExecutionContractId,
      phaseNumber: raw.phaseNumber,
      taskId: raw.taskId,
      correlationId: raw.correlationId,
      inputRef: raw.inputRef,
      selectedLessonIds: raw.selectedLessonIds,
      rootInvocationId: raw.rootInvocationId,
      parentInvocationId: raw.parentInvocationId,
    };
    try {
      return parseAgentDispatchEnvelopeV1(serialized, this.dependencies.registeredActionIds);
    } catch {
      throw new Error("RUNTIME_INVALID_PLAN");
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
