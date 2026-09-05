import { describe, expect, it, vi } from "vitest";
import { SpecialistRuntimeDispatchApplication } from "../src/runtime/pi/specialist-runtime-dispatch-application.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";

const plan = handoffPlan("review-model", "code-review");
const input = {
  agent_action: "code-review" as const,
  nodeAction: "code-review" as const,
  prompt: "review",
  options: { workflowRunId: "workflow-resume" },
};

function createEnvelope(_input: typeof input, parent: { invocationId: string } | null) {
  return {
    schemaVersion: "agent-dispatch/v1" as const,
    agent_action: "code-review" as const,
    dispatchKind: parent === null ? "root" as const : "nested" as const,
    projectId: "project",
    cardKey: "FEAT-resume",
    workflowRunId: null,
    workflowNodeId: null,
    phaseExecutionContractId: null,
    phaseNumber: null,
    taskId: null,
    correlationId: "workflow-resume",
    inputRef: "prompt:review",
    selectedLessonIds: [],
    rootInvocationId: parent?.invocationId ?? null,
    parentInvocationId: parent?.invocationId ?? null,
  };
}

describe("specialist runtime dispatch application", () => {
  it("starts a scoped root specialist when a resumed run has no real parent", async () => {
    const runRoot = vi.fn(async () => "root-result");
    const runNested = vi.fn(async () => "nested-result");
    const application = new SpecialistRuntimeDispatchApplication({
      createEnvelope,
      findParent: () => null,
      registeredActionIds: ["code-review"],
      resolvePlan: () => plan,
      runNested,
      runRoot,
      validateActionPlan: () => true,
    });

    await expect(application.execute(input)).resolves.toBe("root-result");
    expect(runRoot).toHaveBeenCalledWith(expect.objectContaining({
      ...input,
      dispatch: expect.objectContaining({ agentAction: "code-review", dispatchKind: "root" }),
      plan,
    }));
    expect(runNested).not.toHaveBeenCalled();
  });

  it("rejects unknown and conflicting actions before route resolution or runtime lookup", async () => {
    const findParent = vi.fn(() => null);
    const resolvePlan = vi.fn(() => plan);
    const runNested = vi.fn(async () => "nested-result");
    const runRoot = vi.fn(async () => "root-result");
    const application = new SpecialistRuntimeDispatchApplication({
      createEnvelope,
      findParent,
      registeredActionIds: ["code-review"],
      resolvePlan,
      runNested,
      runRoot,
      validateActionPlan: () => true,
    });

    await expect(application.execute(null)).rejects.toThrow("AGENT_DISPATCH_INVALID");
    await expect(application.execute({ ...input, model: "forbidden" })).rejects.toThrow("AGENT_DISPATCH_INVALID");
    await expect(application.execute({ ...input, agent_action: "unknown-action" })).rejects.toThrow("AGENT_ACTION_UNKNOWN");
    await expect(application.execute({ ...input, nodeAction: "phase-worker" })).rejects.toThrow("AGENT_ACTION_CONFLICT");
    expect(resolvePlan).not.toHaveBeenCalled();
    expect(findParent).not.toHaveBeenCalled();
    expect(runRoot).not.toHaveBeenCalled();
    expect(runNested).not.toHaveBeenCalled();
  });

  it("rejects a mismatched or malformed resolved plan before launch", async () => {
    const findParent = vi.fn(() => null);
    const runNested = vi.fn(async () => "nested-result");
    const runRoot = vi.fn(async () => "root-result");
    const invalidPlan = new SpecialistRuntimeDispatchApplication({
      createEnvelope,
      findParent,
      registeredActionIds: ["code-review"],
      resolvePlan: () => ({}) as never,
      runNested,
      runRoot,
      validateActionPlan: () => true,
    });
    const rejectedBinding = new SpecialistRuntimeDispatchApplication({
      createEnvelope,
      findParent,
      registeredActionIds: ["code-review"],
      resolvePlan: () => plan,
      runNested,
      runRoot,
      validateActionPlan: () => false,
    });

    await expect(invalidPlan.execute(input)).rejects.toThrow("RUNTIME_INVALID_PLAN");
    await expect(rejectedBinding.execute(input)).rejects.toThrow("RUNTIME_INVALID_PLAN");
    expect(findParent).toHaveBeenCalledTimes(2);
    expect(runRoot).not.toHaveBeenCalled();
    expect(runNested).not.toHaveBeenCalled();
  });

  it("uses nested dispatch only when a real current-run parent exists", async () => {
    const parent = { invocationId: "parent" };
    const runRoot = vi.fn(async () => "root-result");
    const runNested = vi.fn(async () => "nested-result");
    const application = new SpecialistRuntimeDispatchApplication({
      createEnvelope,
      findParent: () => parent,
      registeredActionIds: ["code-review"],
      resolvePlan: () => plan,
      runNested,
      runRoot,
      validateActionPlan: () => true,
    });

    await expect(application.execute(input)).resolves.toBe("nested-result");
    expect(runNested).toHaveBeenCalledWith(expect.objectContaining({
      ...input,
      dispatch: expect.objectContaining({ agentAction: "code-review", dispatchKind: "nested" }),
      plan,
    }), parent);
    expect(runRoot).not.toHaveBeenCalled();
  });
});
