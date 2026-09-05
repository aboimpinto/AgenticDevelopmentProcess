import { describe, expect, it } from "vitest";
import {
  AGENT_DISPATCH_SCHEMA_VERSION,
  AgentDispatchContractError,
  isAgentDispatchEnvelopeV1,
  parseAgentDispatchEnvelopeV1,
} from "../src/index.js";

const actions = ["start-feature", "code-review"];
const rootEnvelope = {
  schemaVersion: AGENT_DISPATCH_SCHEMA_VERSION,
  agent_action: "start-feature",
  dispatchKind: "root",
  projectId: "HEPHA",
  cardKey: "feature:FEAT-071",
  workflowRunId: "workflow-1",
  workflowNodeId: "post-process",
  phaseExecutionContractId: null,
  phaseNumber: null,
  taskId: null,
  correlationId: "correlation-1",
  inputRef: "input:workflow-1/post-process",
  selectedLessonIds: ["lesson-a", "lesson-b"],
  rootInvocationId: null,
  parentInvocationId: null,
} as const;

function codeOf(candidate: unknown): string | null {
  try {
    parseAgentDispatchEnvelopeV1(candidate, actions);
    return null;
  } catch (error) {
    return error instanceof AgentDispatchContractError ? error.code : "unexpected";
  }
}

describe("agent dispatch V1 public contract", () => {
  it("normalizes complete root and nested envelopes only after registry validation", () => {
    const root = parseAgentDispatchEnvelopeV1(rootEnvelope, actions);
    expect(root.agentAction).toBe("start-feature");
    expect("agent_action" in root).toBe(false);
    expect(Object.isFrozen(root)).toBe(true);

    const nested = {
      ...rootEnvelope,
      agent_action: "code-review",
      dispatchKind: "nested",
      phaseExecutionContractId: "review-contract",
      phaseNumber: 2,
      taskId: "review-task",
      rootInvocationId: "invocation-root",
      parentInvocationId: "invocation-root",
    } as const;
    expect(parseAgentDispatchEnvelopeV1(nested, actions)).toMatchObject({
      agentAction: "code-review",
      dispatchKind: "nested",
      rootInvocationId: "invocation-root",
      parentInvocationId: "invocation-root",
    });
    expect(isAgentDispatchEnvelopeV1(nested, actions)).toBe(true);
  });

  it.each([
    ["absent envelope", undefined, "AGENT_DISPATCH_INVALID"],
    ["null envelope", null, "AGENT_DISPATCH_INVALID"],
    ["primitive envelope", "start-feature", "AGENT_DISPATCH_INVALID"],
    ["missing action", (({ agent_action: _action, ...rest }) => rest)(rootEnvelope), "AGENT_ACTION_MISSING"],
    ["null action", { ...rootEnvelope, agent_action: null }, "AGENT_DISPATCH_INVALID"],
    ["primitive action", { ...rootEnvelope, agent_action: 7 }, "AGENT_DISPATCH_INVALID"],
    ["camel-case alias", { ...rootEnvelope, agentAction: "start-feature" }, "AGENT_ACTION_INVALID_LOCATION"],
    ["nested action", { ...rootEnvelope, metadata: { agent_action: "start-feature" } }, "AGENT_ACTION_INVALID_LOCATION"],
    ["unknown action", { ...rootEnvelope, agent_action: "unknown-action" }, "AGENT_ACTION_UNKNOWN"],
    ["route field", { ...rootEnvelope, model: "forbidden-model" }, "AGENT_DISPATCH_INVALID"],
    ["authentication field", { ...rootEnvelope, authentication: { connectionId: "secret-capable" } }, "AGENT_DISPATCH_INVALID"],
    ["unsorted lessons", { ...rootEnvelope, selectedLessonIds: ["lesson-b", "lesson-a"] }, "AGENT_DISPATCH_INVALID"],
    ["duplicate lessons", { ...rootEnvelope, selectedLessonIds: ["lesson-a", "lesson-a"] }, "AGENT_DISPATCH_INVALID"],
    ["split workflow identity", { ...rootEnvelope, workflowRunId: null }, "AGENT_DISPATCH_INVALID"],
    ["split phase identity", { ...rootEnvelope, phaseExecutionContractId: "phase", phaseNumber: null }, "AGENT_DISPATCH_INVALID"],
    ["task without phase", { ...rootEnvelope, taskId: "task" }, "AGENT_DISPATCH_INVALID"],
    ["root with invocation identity", { ...rootEnvelope, rootInvocationId: "root", parentInvocationId: "root" }, "AGENT_DISPATCH_INVALID"],
    ["nested without parent", { ...rootEnvelope, dispatchKind: "nested", rootInvocationId: "root" }, "AGENT_DISPATCH_INVALID"],
  ])("rejects %s without fallback", (_name, candidate, expectedCode) => {
    expect(codeOf(candidate)).toBe(expectedCode);
    expect(isAgentDispatchEnvelopeV1(candidate, actions)).toBe(false);
  });
});
