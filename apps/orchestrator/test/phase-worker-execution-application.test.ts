import { describe, expect, it, vi } from "vitest";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { PhaseWorkerExecutionApplication } from "../src/workflows/phases/phase-worker-execution-application.js";

const phase = { number: 731, status: "IN_PROGRESS", title: "Arbitrary" } as never;
const feature = { externalId: "arbitrary-feature" } as never;
const project = { id: "arbitrary-project" } as never;

function createTarget() {
  const buildContext = vi.fn(async () => "Scoped context");
  const buildPrompt = vi.fn(() => "Worker prompt");
  const prepareSuccessor = vi.fn(() => ({ handoff: { id: "handoff" }, identityLease: { id: "lease" } }));
  const runWorker = vi.fn(async () => "Worker output");
  const executeProtected = vi.fn(async (input: { run: () => Promise<string> }) => ({
    output: await input.run(),
    testCoverage: { kind: "preserved" as const },
  }));
  return {
    application: new PhaseWorkerExecutionApplication({
      buildContext,
      buildPrompt,
      executeProtected: executeProtected as never,
      prepareSuccessor,
      runWorker,
    }),
    buildContext,
    buildPrompt,
    executeProtected,
    prepareSuccessor,
    runWorker,
  };
}

const input = {
  activeTask: null,
  branchName: "arbitrary-branch",
  cardKey: "arbitrary-card",
  command: "continue_implementing" as const,
  contract: null,
  developerAgent: "Developer Agent",
  feature,
  findings: [],
  identityLease: null,
  implementationAgent: "Implementation Agent",
  implementationModel: handoffPlan("arbitrary-model"),
  implementationStep: "Implement Phase 731",
  isCodePhase: true,
  phase,
  phaseRef: "Phase 731",
  phaseStatus: "IN_PROGRESS",
  phaseTitle: "Arbitrary",
  previousFailureBrief: null,
  project,
  resolvingReviewFindings: false,
  reviewRequired: true,
  runId: "arbitrary-run",
};

describe("PhaseWorkerExecutionApplication", () => {
  it("builds scoped context and runs one protected implementation worker", async () => {
    const target = createTarget();

    await expect(target.application.execute(input)).resolves.toEqual({
      handoff: { id: "handoff" },
      identityLease: { id: "lease" },
      output: "Worker output",
      testCoverage: { kind: "preserved" },
    });
    expect(target.buildContext).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "Implementation Agent" }));
    expect(target.executeProtected).toHaveBeenCalledOnce();
    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "implementation",
      prompt: "Worker prompt",
    }));
  });

  it("forwards semantic execution-contract and active-task identities to runtime evidence", async () => {
    const target = createTarget();
    const activeTask = { id: "semantic-task-id" } as never;

    await target.application.execute({
      ...input,
      activeTask,
      contract: { id: "semantic-phase-contract", role: "implementation" } as never,
    });

    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({
      phaseExecutionContractId: "semantic-phase-contract",
      taskId: "semantic-task-id",
    }));
  });

  it("uses the planning role declared by the phase contract", async () => {
    const target = createTarget();

    await target.application.execute({ ...input, contract: { role: "planning" } as never });

    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "planning" }));
  });

  it("routes fixer context and preserves the leased remediation successor", async () => {
    const target = createTarget();

    await target.application.execute({
      ...input,
      findings: [{ findingId: "arbitrary-finding" }],
      identityLease: { id: "prior-lease" },
      previousFailureBrief: "Prior failure",
      resolvingReviewFindings: true,
    });

    expect(target.buildContext).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "review-finding-resolution",
      previousFailureBrief: "Prior failure",
    }));
    expect(target.prepareSuccessor).toHaveBeenCalledWith(expect.objectContaining({
      currentIdentityLease: { id: "prior-lease" },
      resolvingReviewFindings: true,
    }));
    expect(target.runWorker).toHaveBeenCalledWith(expect.objectContaining({ agentRole: "review-finding-resolution" }));
  });
});
