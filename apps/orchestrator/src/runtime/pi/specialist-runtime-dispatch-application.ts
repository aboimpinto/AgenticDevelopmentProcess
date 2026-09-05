import {
  isHandoffPlanV1,
  parseAgentDispatchEnvelopeV1,
  type AgentActionId,
  type AgentDispatchEnvelopeV1,
  type HandoffPlanV1,
  type SerializedAgentDispatchEnvelopeV1,
} from "@hepha/shared";

export interface SpecialistRuntimeDispatchInput<TOptions> {
  /** Explicit top-level dispatch action. */
  agent_action: AgentActionId;
  /** Validated launch-node action used only as an equality cross-check. */
  nodeAction: AgentActionId;
  prompt: string;
  options: TOptions;
}

type AdmittedSpecialistRuntimeDispatchInput<TOptions> = SpecialistRuntimeDispatchInput<TOptions> & {
  dispatch: AgentDispatchEnvelopeV1;
  plan: HandoffPlanV1;
};

/** Admits one explicit specialist action before resolving and launching a root or nested worker. */
export class SpecialistRuntimeDispatchApplication<TOptions, TParent> {
  constructor(private readonly dependencies: {
    createEnvelope: (
      input: SpecialistRuntimeDispatchInput<TOptions>,
      parent: TParent | null,
    ) => SerializedAgentDispatchEnvelopeV1;
    findParent: (options: TOptions) => TParent | null;
    registeredActionIds: readonly AgentActionId[];
    resolvePlan: (actionId: AgentActionId) => HandoffPlanV1;
    runNested: (input: AdmittedSpecialistRuntimeDispatchInput<TOptions>, parent: TParent) => Promise<string>;
    runRoot: (input: AdmittedSpecialistRuntimeDispatchInput<TOptions>) => Promise<string>;
    validateActionPlan: (actionId: AgentActionId, plan: HandoffPlanV1) => boolean;
  }) {}

  async execute(raw: unknown): Promise<string> {
    if (!isDispatchInput(raw)) throw new Error("AGENT_DISPATCH_INVALID");
    const input = raw as unknown as SpecialistRuntimeDispatchInput<TOptions>;
    if (!this.dependencies.registeredActionIds.includes(input.agent_action)) {
      throw new Error("AGENT_ACTION_UNKNOWN");
    }
    if (input.agent_action !== input.nodeAction) throw new Error("AGENT_ACTION_CONFLICT");

    const parent = this.dependencies.findParent(input.options);
    let dispatch: AgentDispatchEnvelopeV1;
    try {
      dispatch = parseAgentDispatchEnvelopeV1(
        this.dependencies.createEnvelope(input, parent),
        this.dependencies.registeredActionIds,
      );
    } catch {
      throw new Error("AGENT_DISPATCH_INVALID");
    }
    if (dispatch.agentAction !== input.agent_action
      || (parent === null ? dispatch.dispatchKind !== "root" : dispatch.dispatchKind !== "nested")) {
      throw new Error("AGENT_ACTION_CONFLICT");
    }

    const plan = this.dependencies.resolvePlan(dispatch.agentAction);
    if (!isHandoffPlanV1(plan) || plan.resolvedRoute.action.actionId !== dispatch.agentAction
      || !this.dependencies.validateActionPlan(dispatch.agentAction, plan)) {
      throw new Error("RUNTIME_INVALID_PLAN");
    }

    const admitted = { ...input, dispatch, plan };
    return parent === null
      ? await this.dependencies.runRoot(admitted)
      : await this.dependencies.runNested(admitted, parent);
  }
}

function isDispatchInput(value: unknown): value is Record<string, unknown> {
  if (!record(value) || !exactKeys(value, ["agent_action", "nodeAction", "prompt", "options"])) return false;
  return safeAction(value.agent_action) && safeAction(value.nodeAction)
    && safePrompt(value.prompt) && value.options !== undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}
function safeAction(value: unknown): value is AgentActionId {
  return safeText(value, 128) && /^[a-z][a-z0-9-]*$/u.test(value);
}
function safeText(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    && value.trim() === value && !/[\u0000-\u001f\u007f]/u.test(value);
}
function safePrompt(value: unknown): value is string {
  return typeof value === "string" && value.length <= 2_000_000
    && value.trim().length > 0 && !value.includes("\u0000");
}
