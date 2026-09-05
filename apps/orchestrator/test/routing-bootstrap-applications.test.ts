import type { StoredDeepDiveSession } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { DesignFeatureExecutionApplication } from "../src/application/features/design-feature-execution-application.js";
import { FeatureFindingExecutionApplication } from "../src/application/features/feature-finding-execution-application.js";
import { HumanReviewFindingDocumentRepository } from "../src/application/features/human-review-finding-document-repository.js";
import { RefineFeatureExecutionApplication } from "../src/application/features/refine-feature-execution-application.js";
import { createDeepDiveApplications } from "../src/bootstrap/deep-dive-applications.js";
import { createFeaturePreparationApplications } from "../src/bootstrap/feature-preparation-applications.js";
import { createFeatureCompletionApplications } from "../src/bootstrap/feature-completion-applications.js";
import { createImplementationRecoveryApplications } from "../src/bootstrap/implementation-recovery-applications.js";
import { createImplementationWorkerApplications } from "../src/bootstrap/implementation-worker-applications.js";
import { createWorkItemAuthoringApplications } from "../src/bootstrap/work-item-authoring-applications.js";

function dependenciesOf<T>(subject: unknown): T {
  return (subject as { dependencies: T }).dependencies;
}

function routingResolver() {
  return {
    resolvePlan: vi.fn((actionId: string) => `${actionId}-route`),
  };
}

describe("routing bootstrap application composition", () => {
  it("routes work-item discovery, refinement, and submission through the resolver", () => {
    const routeResolver = routingResolver();
    const applications = createWorkItemAuthoringApplications({
      documentWriter: {} as never,
      epicState: {} as never,
      idAllocator: {} as never,
      routeResolver: routeResolver as never,
      notifyChanged: vi.fn(),
      registry: { get: vi.fn() } as never,
      runPrompt: vi.fn(),
      workItems: { scan: vi.fn() } as never,
    });

    const batchDependencies = dependenciesOf<{ discover: unknown }>(applications.missingFeatureBatchApplication);
    const discoveryDependencies = dependenciesOf<{ choosePlanningModel(): string }>(batchDependencies.discover);
    const refinementDependencies = dependenciesOf<{ chooseModel(): string }>(applications.epicRefinementApplication);
    const submissionDependencies = dependenciesOf<{ chooseModel(): string }>(applications.epicSubmissionApplication);

    expect(discoveryDependencies.choosePlanningModel()).toBe("submit-feature-route");
    expect(refinementDependencies.chooseModel()).toBe("submit-epic-route");
    expect(submissionDependencies.chooseModel()).toBe("submit-epic-route");
    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("submit-feature");
    expect(routeResolver.resolvePlan.mock.calls.filter(([action]) => action === "submit-epic")).toHaveLength(2);
  });

  it("routes deep-dive execution and interactive chat through registered actions", async () => {
    const routeResolver = routingResolver();
    const session = deepDiveSession();
    const runPrompt = vi.fn(async () => "Resolver-backed reply");
    const applications = createDeepDiveApplications({
      epicState: { syncEpic: vi.fn() } as never,
      lessons: { render: vi.fn() } as never,
      metadataStore: {
        enabled: true,
        getDeepDiveSession: vi.fn(async () => session),
        updateDeepDiveSession: vi.fn(async (next: StoredDeepDiveSession) => next),
      } as never,
      routeResolver: routeResolver as never,
      notifyChanged: vi.fn(),
      registry: { get: vi.fn() } as never,
      runCoordinator: { createCardRunner: vi.fn() } as never,
      runPrompt,
      settings: {
        deepDiveDocumentUpdateTimeoutMs: 1_000,
        deepDiveModelRewriteMaxChars: 1_000,
        runTimeoutMs: 1_000,
        sessionDir: "/tmp/hepha-sessions",
      },
      workItems: { scan: vi.fn() } as never,
    });

    const startDependencies = dependenciesOf<{ requireModel(model: unknown, label: string): string }>(applications.deepDiveStartApplication);
    const completionDependencies = dependenciesOf<{ requireModel(model: unknown, label: string): string }>(applications.deepDiveCompletionApplication);
    expect(startDependencies.requireModel("ignored-static-model", "start")).toBe("deep-dive-route");
    expect(completionDependencies.requireModel("ignored-static-model", "completion")).toBe("deep-dive-route");
    await expect(applications.deepDiveSessionApplication.chat(
      session.id,
      "question-1",
      { message: "Which route handles this?" },
    )).resolves.toMatchObject({
      questions: [expect.objectContaining({
        chatMessages: expect.arrayContaining([
          expect.objectContaining({ content: "Resolver-backed reply", role: "assistant" }),
        ]),
      })],
    });
    expect(routeResolver.resolvePlan).toHaveBeenNthCalledWith(1, "deep-dive");
    expect(routeResolver.resolvePlan).toHaveBeenNthCalledWith(2, "deep-dive");
    expect(routeResolver.resolvePlan).toHaveBeenNthCalledWith(3, "deep-dive");
    expect(runPrompt).toHaveBeenCalledWith(expect.stringContaining("Which route handles this?"), "deep-dive-route");
  });

  it("routes design and refinement workers at their public dispatch boundaries", async () => {
    const routeResolver = routingResolver();
    const project = {
      createdAt: "2026-07-23T08:00:00.000Z",
      id: "hepha",
      memoryBankPath: "/tmp/hepha-memory-bank",
      name: "HEPHA",
      originalMemoryBankPathInput: "/tmp/hepha-memory-bank",
      originalRootPathInput: process.cwd(),
      rootPath: process.cwd(),
      updatedAt: "2026-07-23T08:00:00.000Z",
    };
    const designFeature = preparationFeature("design", "requires_ui");
    const refineFeature = preparationFeature("refine", "no_ui");
    const resolveWorkflow = vi.fn(async (input: { cardId: string }) => ({
      feature: input.cardId === designFeature.id ? designFeature : refineFeature,
      project,
    }));
    const designExecute = vi.spyOn(DesignFeatureExecutionApplication.prototype, "execute")
      .mockImplementation(function () {
        const dependencies = dependenciesOf<{ requireModel(model: unknown, label: string): string }>(this);
        expect(dependencies.requireModel("ignored-static-model", "design worker")).toBe("design-feature-route");
        return Promise.resolve();
      });
    const refineExecute = vi.spyOn(RefineFeatureExecutionApplication.prototype, "execute")
      .mockImplementation(function () {
        const dependencies = dependenciesOf<{ requireModel(model: unknown, label: string): string }>(this);
        expect(dependencies.requireModel("ignored-static-model", "refine worker")).toBe("refine-feature-route");
        return Promise.resolve();
      });
    const findingExecute = vi.spyOn(FeatureFindingExecutionApplication.prototype, "execute")
      .mockImplementation(function () {
        const dependencies = dependenciesOf<{ chooseModel(): string }>(this);
        expect(dependencies.chooseModel()).toBe("resolve-review-findings-route");
        return Promise.resolve();
      });
    const ensureFindingPhase = vi.spyOn(HumanReviewFindingDocumentRepository.prototype, "ensurePhase")
      .mockReturnValue({ fileName: "phase-7-human-review-findings.md", number: 7, path: "/tmp/phase-7-human-review-findings.md" });
    const appendFinding = vi.spyOn(HumanReviewFindingDocumentRepository.prototype, "appendFinding")
      .mockImplementation(() => undefined);

    try {
      const applications = createFeaturePreparationApplications({
        completeFeature: vi.fn(),
        contextCollector: { collect: vi.fn() } as never,
        designArtifactPolicy: {} as never,
        failureBriefPresenter: { create: vi.fn() },
        metadataStore: {
          enabled: true,
          createFeatureFinding: vi.fn(async () => undefined),
          recordFeatureFindingAgentRun: vi.fn(async () => undefined),
          recordFeatureWorkflowRun: vi.fn(async () => undefined),
        } as never,
        routeResolver: routeResolver as never,
        notifyChanged: vi.fn(),
        phaseContract: {} as never,
        refineFeatureMaxRuntimeMs: null,
        refineFeatureStallTimeoutMs: 1_000,
        runCoordinator: {} as never,
        runOneShotPiPrompt: vi.fn(),
        stewardId: undefined,
        targets: {
          resolveImplementation: vi.fn(async () => ({ feature: designFeature, project })),
          resolveWorkflow,
        } as never,
        transitionReceiptPolicy: {} as never,
        workItems: { scan: vi.fn(async () => [designFeature, refineFeature]) } as never,
        worker: {} as never,
      });

      await applications.featurePreparationApplication.startDesign({ projectId: project.id, cardId: designFeature.id });
      await applications.featurePreparationApplication.startRefine({ projectId: project.id, cardId: refineFeature.id });
      await applications.featureFindingApplication.submit({
        projectId: project.id,
        cardId: designFeature.id,
        content: "The resolver-selected review worker should inspect this finding.",
      });

      expect(designExecute).toHaveBeenCalledOnce();
      expect(refineExecute).toHaveBeenCalledOnce();
      expect(findingExecute).toHaveBeenCalledOnce();
      expect(routeResolver.resolvePlan).toHaveBeenCalledWith("design-feature");
      expect(routeResolver.resolvePlan).toHaveBeenCalledWith("refine-feature");
      expect(routeResolver.resolvePlan).toHaveBeenCalledWith("resolve-review-findings");
    } finally {
      designExecute.mockRestore();
      refineExecute.mockRestore();
      findingExecute.mockRestore();
      ensureFindingPhase.mockRestore();
      appendFinding.mockRestore();
    }
  });

  it("routes completion and recovery models without consulting a static workflow model", () => {
    const routeResolver = routingResolver();
    const completion = createFeatureCompletionApplications({
      cancelPiProcesses: vi.fn(),
      contextCollector: { collect: vi.fn() } as never,
      epicState: { syncLinkedForFeature: vi.fn() } as never,
      failureBriefPresenter: { create: vi.fn() },
      finalizer: { launch: vi.fn() },
      metadataStore: {} as never,
      routeResolver: routeResolver as never,
      notifyChanged: vi.fn(),
      requestCancellation: vi.fn(),
      runCoordinator: {} as never,
      targets: {} as never,
      workItems: { scan: vi.fn() } as never,
    });
    const recovery = createImplementationRecoveryApplications({
      codeReviewFailureContext: {} as never,
      consoleSummary: {} as never,
      createPiEnvironment: vi.fn(() => ({})),
      ensureCargoShimDirectory: vi.fn(() => null),
      failureBriefPresenter: { create: vi.fn() },
      lessons: {} as never,
      machineState: {} as never,
      routeResolver: routeResolver as never,
      recordPhaseProgress: vi.fn(),
      runAutonomous: vi.fn(),
      runCoordinator: {} as never,
      targets: {} as never,
      worker: {} as never,
    });

    const completionDependencies = dependenciesOf<{ requireModel(model: unknown, label: string): string }>(completion.completeFeatureExecutionApplication);
    const recoveryDependencies = dependenciesOf<{ resolveRecoveryModel(input: { command: "start-implementing" }): string }>(recovery.implementationAutoRecoveryApplication);
    expect(completionDependencies.requireModel("ignored-static-model", "completion")).toBe("complete-feature-route");
    expect(recoveryDependencies.resolveRecoveryModel({ command: "start-implementing" })).toBe("workflow-recovery-route");
    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("complete-feature");
    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("workflow-recovery");
  });

  it("routes an interactive implementation handoff at execution time", () => {
    const routeResolver = routingResolver();
    const phaseBoundary = {} as never;
    const applications = createImplementationWorkerApplications({
      contextCollector: { collect: vi.fn() } as never,
      routeResolver: routeResolver as never,
      notifyChanged: vi.fn(),
      phaseWorkflow: {
        complete: phaseBoundary,
        entry: phaseBoundary,
        exit: phaseBoundary,
        failure: phaseBoundary,
        humanReview: phaseBoundary,
        planning: phaseBoundary,
        planningArtifactRequired: vi.fn(),
        postWorkerReview: phaseBoundary,
        postWorkerValidation: phaseBoundary,
        preReview: phaseBoundary,
        queue: phaseBoundary,
        review: phaseBoundary,
        settleTask: phaseBoundary,
        workerEntry: phaseBoundary,
        workerExecution: phaseBoundary,
        workerResult: phaseBoundary,
      },
      runCoordinator: {} as never,
      runtimeDatabasePath: undefined,
      targets: {} as never,
      timingPolicy: {} as never,
      worker: {} as never,
      workItems: {} as never,
    });

    const handoffDependencies = dependenciesOf<{
      resolveImplementationModel(input: { agentAction: "continue-implementing"; command: "continue-implementing" }): string;
    }>(applications.interactiveImplementationHandoffApplication);
    expect(handoffDependencies.resolveImplementationModel({ agentAction: "continue-implementing", command: "continue-implementing" })).toBe("continue-implementing-route");
    expect(routeResolver.resolvePlan).toHaveBeenCalledWith("continue-implementing");
  });
});

function preparationFeature(id: string, uiRequirementDecision: "requires_ui" | "no_ui"): WorkItemCard {
  return {
    externalId: `FEAT-${id}`,
    featureWorkflow: {
      activeRun: null,
      hasDesignArtifacts: false,
      hasRefinementArtifacts: false,
      uiRequirementDecision,
    },
    id,
    kind: "feature",
    phases: [{
      fileName: "phase-1-completed.md",
      number: 1,
      status: "COMPLETED",
      title: "Completed implementation",
    }],
    specMarkdown: `# FEAT-${id}`,
    stateFolder: "01_SUBMITTED",
    title: `${id} routing`,
  } as WorkItemCard;
}

function deepDiveSession(): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "FEAT-061",
    cardId: "card-feat-061",
    cardKey: "feature:FEAT-061",
    cardKind: "feature",
    cardTitle: "Agent routing",
    completedAt: null,
    createdAt: "2026-07-23T08:00:00.000Z",
    id: "deep-dive-session-1",
    originalDocument: "# Agent routing",
    originalDocumentHash: "hash",
    originalDocumentPath: "/tmp/FeatureDescription.md",
    originalDocumentUpdatedAt: "2026-07-23T08:00:00.000Z",
    projectId: "hepha",
    questions: [{
      answerText: null,
      chatMessages: [],
      id: "question-1",
      options: [{ description: "Use the policy resolver.", id: "resolver", label: "Resolver" }],
      prompt: "Which route should execute the workflow?",
      recommendedOptionId: "resolver",
      selectedOptionId: null,
      status: "pending",
      topic: "Routing authority",
    }],
    status: "question_round",
    updatedAt: "2026-07-23T08:00:00.000Z",
  };
}
