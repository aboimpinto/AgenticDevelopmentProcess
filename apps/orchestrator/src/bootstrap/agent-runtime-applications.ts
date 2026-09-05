import { DirectHostRuntimeEvidenceStore, RuntimeInvocationStore, type AgentRoutingStore, type CardMetadataStore, type ModelCatalogStore, type ProviderConnectionStore } from "@hepha/db";
import {
  AGENT_DISPATCH_SCHEMA_VERSION,
  type AgentActionId,
  type HandoffPlanV1,
  type RuntimeInvocationEvidenceV1,
} from "@hepha/shared";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { StartTransitionStateRecorder } from "../application/features/start-transition-state-recorder.js";
import { DirectHostInstrumentationRegistry } from "../application/runtime-evidence/direct-host-instrumentation-registry.js";
import { WorkflowConsoleApplication } from "../application/workflow-console/workflow-console-application.js";
import { WorkflowConsoleSummaryPresenter } from "../application/workflow-console/workflow-console-summary-presenter.js";
import { appendToolProfileToSummary } from "../workflow-receipt.js";
import { appendPhaseExecutionAudit } from "../workflows/phases/phase-execution-audit.js";
import { DetachedCompletionWorkerApplication } from "../workflows/phases/detached-completion-worker-application.js";
import {
  ImplementationWorkerApplication,
  type ImplementationWorkerInput,
  type ImplementationWorkerPromptOptions,
} from "../workflows/phases/implementation-worker-application.js";
import { formatImplementationWorkerFailure } from "../workflows/phases/implementation-worker-failure.js";
import { summarizeWorkflowOutput } from "../workflows/workflow-output-summary.js";
import { isWorkflowCancelledError, throwIfWorkflowCancelled } from "../workflow-cancellation.js";
import { AgentTaskRuntime } from "../runtime/pi/agent-task-runtime.js";
import { createPinnedPiDetachedPromptRunner } from "../runtime/pi/pi-detached-runner.js";
import { createPiOneShotPromptRunner } from "../runtime/pi/pi-one-shot-runner.js";
import { IsolatedPiWorkerContext } from "../runtime/pi/isolated-pi-worker-context.js";
import {
  createPlanBoundDetachedPromptLauncher,
  createPlanBoundPiPromptRunner,
} from "../runtime/pi/plan-bound-pi-prompt-runner.js";
import {
  RuntimeExecutionCoordinator,
  WorkflowTaskDurableWorkStatePort,
} from "../runtime/pi/runtime-execution-coordinator.js";
import {
  HandoffPlanExecutor,
  type PiAttemptProcessResult,
} from "../runtime/pi/handoff-plan-executor.js";
import { NestedRuntimeDispatchAdapter } from "../runtime/pi/runtime-worker-dispatch.js";
import { SpecialistRuntimeDispatchApplication } from "../runtime/pi/specialist-runtime-dispatch-application.js";
import { PiWorkflowProcessRegistry } from "../runtime/pi/pi-process-registry.js";
import {
  formatPiSpawnError,
  getPiInvocation,
  renderPiInvocation,
} from "../runtime/pi/pi-invocation-resolver.js";
import { slugifySessionFileComponent } from "../runtime/pi/session-file-name-policy.js";
import { validateWorkflowNodeSkill } from "../skill-contract-integration.js";
import { AgentRegistry } from "../agent-routing/agent-registry.js";
import { readRoutingCatalogFacts } from "../agent-routing/routing-catalog-facts.js";
import { RoutingPolicyService } from "../agent-routing/routing-policy-service.js";
import { RoutingActionResolver } from "../agent-routing/routing-action-resolver.js";
import type { createOrchestratorRuntimeSettings } from "./orchestrator-runtime-settings.js";
import {
  readPiAuthenticatedProviderIds,
  runtimeProviderIdForConnection,
  type PiInstallationDefault,
} from "../runtime/pi/pi-installation-default.js";
import type { SecretVaultAdapter } from "../provider-connections/secret-vault.js";

type RuntimeSettings = ReturnType<typeof createOrchestratorRuntimeSettings>;

export interface AgentRuntimeApplicationsDependencies {
  metadataStore: CardMetadataStore;
  routingCatalogStore: Pick<ModelCatalogStore, "listModels">;
  routingConnectionStore: Pick<ProviderConnectionStore, "getConnection" | "listConnections">;
  routingInstallationDefault: PiInstallationDefault | null;
  routingStore: AgentRoutingStore;
  routingVault: Pick<SecretVaultAdapter, "readSecret">;
  runPinnedPrompt?: ReturnType<typeof createPiOneShotPromptRunner>;
  settings: Pick<RuntimeSettings,
    | "createPiProcessEnv"
    | "implementationIdleTimeoutMs"
    | "implementationRunTimeoutMs"
    | "implementationSkillPaths"
    | "inferredWorkspaceRoot"
    | "mcpCompatibility"
    | "runTimeoutMs"
    | "runtimeEnv"
    | "sessionDir"
    | "workspaceRoot"
  >;
}

/** Composes Pi execution, model routing, workflow console, and worker runtimes. */
export function createAgentRuntimeApplications(dependencies: AgentRuntimeApplicationsDependencies) {
  const { metadataStore, settings } = dependencies;
  const agentRegistry = new AgentRegistry();
  const routingPolicyService = new RoutingPolicyService({
    catalogFacts: () => readRoutingCatalogFacts(dependencies.routingCatalogStore, dependencies.routingConnectionStore),
    registry: agentRegistry,
    store: dependencies.routingStore,
  });
  const routeResolver = new RoutingActionResolver(
    routingPolicyService,
    dependencies.routingInstallationDefault
      ? {
        route: dependencies.routingInstallationDefault.route,
        now: () => new Date().toISOString(),
        createCorrelationId: randomUUID,
      }
      : null,
  );
  const runtimeDatabasePath = settings.runtimeEnv.HEPHA_DATABASE_PATH
    ?? resolve(settings.inferredWorkspaceRoot, ".hepha", "hepha.sqlite");
  const directHostInstrumentationRegistry = new DirectHostInstrumentationRegistry();
  const runtimeEvidenceContext = {
    isRegisteredAction: (actionId: AgentActionId) => agentRegistry.get(actionId) !== null,
    isTrustedDirectInstrumentation: (input: Parameters<DirectHostInstrumentationRegistry["isTrusted"]>[0]) =>
      directHostInstrumentationRegistry.isTrusted(input),
  };
  const runtimeInvocationStore = new RuntimeInvocationStore(runtimeDatabasePath);
  const directHostRuntimeEvidenceStore = new DirectHostRuntimeEvidenceStore(
    runtimeDatabasePath,
    runtimeEvidenceContext,
  );
  const workflowPiProcessRegistry = new PiWorkflowProcessRegistry();
  const workflowConsoleApplication = new WorkflowConsoleApplication({
    activeRunIds: () => workflowPiProcessRegistry.activeRunIds(),
    now: () => new Date(),
    sessionDirectory: settings.sessionDir,
  });
  const workflowConsoleSummaryPresenter = new WorkflowConsoleSummaryPresenter(
    (runId) => workflowConsoleApplication.read(runId),
  );
  const startTransitionStateRecorder = new StartTransitionStateRecorder({
    reportError: (message, error) => console.error(message, error instanceof Error ? error.message : error),
    store: metadataStore,
  });
  const runPinnedPiPrompt = dependencies.runPinnedPrompt ?? createPiOneShotPromptRunner({
    argumentEnv: settings.runtimeEnv,
    defaultTimeoutMs: settings.runTimeoutMs,
    formatInvocation: renderPiInvocation,
    formatSpawnError: formatPiSpawnError,
    getInvocation: getPiInvocation,
    implementationIdleTimeoutMs: settings.implementationIdleTimeoutMs,
    implementationSkillPaths: settings.implementationSkillPaths,
    implementationTimeoutMs: settings.implementationRunTimeoutMs,
    ...(settings.mcpCompatibility ? { mcpCompatibility: settings.mcpCompatibility } : {}),
    processRegistry: workflowPiProcessRegistry,
    sessionDirectory: settings.sessionDir,
    workspaceRoot: settings.workspaceRoot,
  });
  const authenticatedProviderIds = readPiAuthenticatedProviderIds(settings.runtimeEnv);
  const providerIdForConnection = (connection: NonNullable<ReturnType<typeof dependencies.routingConnectionStore.getConnection>>) =>
    runtimeProviderIdForConnection(connection, dependencies.routingInstallationDefault, authenticatedProviderIds);
  const durableWorkState = new WorkflowTaskDurableWorkStatePort(runtimeInvocationStore, metadataStore);
  const runOneShotPiPrompt = createPlanBoundPiPromptRunner({
    connections: dependencies.routingConnectionStore,
    contextFactory: new IsolatedPiWorkerContext({
      baseEnvironment: settings.createPiProcessEnv,
      createUniqueId: randomUUID,
      runtimeRoot: resolve(settings.inferredWorkspaceRoot, ".hepha", "pi-workers"),
    }),
    providerIdForConnection,
    receipts: runtimeInvocationStore,
    runPinnedPrompt: runPinnedPiPrompt,
    vault: dependencies.routingVault,
    workspaceRoot: settings.workspaceRoot,
    workState: durableWorkState,
  });
  const nestedPromptPayloads = new Map<string, { prompt: string; options: ImplementationWorkerPromptOptions }>();
  const nestedExecutor = new HandoffPlanExecutor({
    connections: dependencies.routingConnectionStore,
    contextFactory: new IsolatedPiWorkerContext({
      baseEnvironment: settings.createPiProcessEnv,
      createUniqueId: randomUUID,
      runtimeRoot: resolve(settings.inferredWorkspaceRoot, ".hepha", "pi-workers"),
    }),
    createId: randomUUID,
    now: () => new Date().toISOString(),
    process: {
      execute: async (request): Promise<PiAttemptProcessResult> => {
        const payload = nestedPromptPayloads.get(request.inputRef);
        if (!payload) return { status: "failed", exitCode: null, failureCode: "invalid_input" };
        try {
          const output = await runPinnedPiPrompt(payload.prompt, {
            environment: request.environment,
            model: { provider: request.providerId, model: request.approvedRoute.modelId },
          }, payload.options);
          return { status: "completed", exitCode: 0, failureCode: null, output };
        } catch (error) {
          return classifyNestedProcessFailure(error);
        }
      },
    },
    providerIdForConnection,
    receipts: runtimeInvocationStore,
    vault: dependencies.routingVault,
  });
  const nestedCoordinator = new RuntimeExecutionCoordinator({
    executor: nestedExecutor,
    now: () => new Date().toISOString(),
    receipts: runtimeInvocationStore,
    workState: durableWorkState,
  });
  const registeredActionIds = agentRegistry.list().map((entry) => entry.actionId);
  const validateActionPlan = (actionId: AgentActionId, plan: HandoffPlanV1) => {
    const registered = agentRegistry.get(actionId);
    const planned = plan.resolvedRoute.action;
    return registered !== null
      && registered.actionId === planned.actionId
      && registered.actionType === planned.actionType
      && registered.roleId === planned.roleId
      && registered.promptVersion === planned.promptVersion
      && registered.capabilityRequirements.minimumContextWindowTokens
        === planned.capabilityRequirements.minimumContextWindowTokens
      && registered.capabilityRequirements.requiresApi === planned.capabilityRequirements.requiresApi
      && registered.capabilityRequirements.requiresReasoning === planned.capabilityRequirements.requiresReasoning
      && registered.capabilityRequirements.requiresTools === planned.capabilityRequirements.requiresTools;
  };
  const nestedRuntimeDispatchAdapter = new NestedRuntimeDispatchAdapter({
    coordinator: nestedCoordinator,
    createId: randomUUID,
    registeredActionIds,
    resolvePlan: (actionId) => routeResolver.resolvePlan(actionId),
    validateActionPlan,
  });
  const specialistRuntimeDispatchApplication = new SpecialistRuntimeDispatchApplication<
    ImplementationWorkerPromptOptions,
    RuntimeInvocationEvidenceV1
  >({
    createEnvelope: (input, parent) => ({
      schemaVersion: AGENT_DISPATCH_SCHEMA_VERSION,
      agent_action: input.agent_action,
      dispatchKind: parent === null ? "root" : "nested",
      projectId: input.options.cwd,
      cardKey: input.options.runtimeContext.cardKey,
      workflowRunId: input.options.workflowRunId,
      workflowNodeId: input.options.runtimeContext.taskId
        ?? input.options.runtimeContext.phaseExecutionContractId
        ?? input.agent_action,
      phaseExecutionContractId: input.options.runtimeContext.phaseExecutionContractId,
      phaseNumber: input.options.runtimeContext.phaseNumber,
      taskId: input.options.runtimeContext.taskId,
      correlationId: input.options.workflowRunId,
      inputRef: `prompt:${randomUUID()}`,
      selectedLessonIds: [...new Set(input.options.runtimeContext.selectedLessonIds)].sort(),
      rootInvocationId: parent?.receipt.rootInvocationId ?? null,
      parentInvocationId: parent?.receipt.invocationId ?? null,
    }),
    findParent: (options) => findRuntimeParent(runtimeInvocationStore, options),
    registeredActionIds,
    resolvePlan: (actionId) => routeResolver.resolvePlan(actionId),
    runRoot: ({ prompt, plan, options }) => runOneShotPiPrompt(prompt, plan, options),
    runNested: async ({ dispatch, prompt, plan, options }, _parent) => {
      nestedPromptPayloads.set(dispatch.inputRef, { prompt, options });
      try {
        const dispatched = await nestedRuntimeDispatchAdapter.dispatchResolved(dispatch, plan);
        if (!dispatched.execution.ok) throw new Error(dispatched.execution.code);
        return dispatched.execution.attemptResult.output;
      } finally {
        nestedPromptPayloads.delete(dispatch.inputRef);
      }
    },
    validateActionPlan,
  });
  const runNestedPiPrompt = (
    actionId: AgentActionId,
    prompt: string,
    plan: HandoffPlanV1,
    options: ImplementationWorkerPromptOptions,
  ) => {
    if (plan.resolvedRoute.action.actionId !== actionId) throw new Error("AGENT_ACTION_CONFLICT");
    return specialistRuntimeDispatchApplication.execute({
      agent_action: actionId,
      nodeAction: actionId,
      prompt,
      options,
    });
  };
  const runPinnedDetachedPrompt = createPinnedPiDetachedPromptRunner({
    argumentEnv: settings.runtimeEnv,
    formatInvocation: renderPiInvocation,
    formatSpawnError: formatPiSpawnError,
    getInvocation: getPiInvocation,
    implementationSkillPaths: settings.implementationSkillPaths,
    processRegistry: workflowPiProcessRegistry,
    sessionDirectory: settings.sessionDir,
    workspaceRoot: settings.workspaceRoot,
  });
  const createImplementationWorkerApplication = (
    runPrompt: ConstructorParameters<typeof ImplementationWorkerApplication>[0]["runPrompt"],
    runNestedPrompt?: ConstructorParameters<typeof ImplementationWorkerApplication>[0]["runNestedPrompt"],
  ) => new ImplementationWorkerApplication({
    appendAudit: appendPhaseExecutionAudit,
    appendProfile: appendToolProfileToSummary,
    assertRunActive: throwIfWorkflowCancelled,
    buildSessionFile: ({ agentRole, agentRunId, runId }) => resolve(
      settings.sessionDir,
      `${runId}-${slugifySessionFileComponent(agentRole)}-${agentRunId}.json`,
    ),
    createId: randomUUID,
    formatFailure: formatImplementationWorkerFailure,
    isCancelled: isWorkflowCancelledError,
    recordAgentRun: (input) => metadataStore.recordImplementationAgentRun(input),
    runPrompt,
    ...(runNestedPrompt ? { runNestedPrompt } : {}),
    summarizeOutput: summarizeWorkflowOutput,
    validateActionPlan,
    validateNodeSkill: validateWorkflowNodeSkill,
  });
  const implementationWorkerApplication = createImplementationWorkerApplication(runOneShotPiPrompt, runNestedPiPrompt);
  const nestedWorkerActionApplications = {
    runCodeReview: (input: ImplementationWorkerInput) => implementationWorkerApplication.executeNested("code-review", input),
    runPhaseLessonsCapture: (input: ImplementationWorkerInput) => implementationWorkerApplication.executeNested(
      "phase-lessons-capture", { ...input, agentAction: "phase-lessons-capture", plan: routeResolver.resolvePlan("phase-lessons-capture") },
    ),
    runFeatureLessonsWriter: (input: ImplementationWorkerInput) => implementationWorkerApplication.executeNested(
      "feature-lessons-writer", { ...input, agentAction: "feature-lessons-writer", plan: routeResolver.resolvePlan("feature-lessons-writer") },
    ),
    runPostCompleteLessonsCurator: (input: ImplementationWorkerInput) => implementationWorkerApplication.executeNested(
      "post-complete-lessons-curator", { ...input, agentAction: "post-complete-lessons-curator", plan: routeResolver.resolvePlan("post-complete-lessons-curator") },
    ),
  };
  const createDetachedCompletionWorkerApplication = (
    afterSuccessfulCompletion: (input: Parameters<DetachedCompletionWorkerApplication["launch"]>[0]) => Promise<void>,
  ) => new DetachedCompletionWorkerApplication({
    afterSuccessfulCompletion,
    buildSessionFile: ({ agentRole, agentRunId, runId }) => resolve(
      settings.sessionDir,
      `${runId}-${slugifySessionFileComponent(agentRole)}-${agentRunId}.json`,
    ),
    createId: randomUUID,
    formatFailure: formatImplementationWorkerFailure,
    launch: createPlanBoundDetachedPromptLauncher({
      connections: dependencies.routingConnectionStore,
      contextFactory: new IsolatedPiWorkerContext({
        baseEnvironment: settings.createPiProcessEnv,
        createUniqueId: randomUUID,
        runtimeRoot: resolve(settings.inferredWorkspaceRoot, ".hepha", "pi-workers"),
      }),
      providerIdForConnection,
      receipts: runtimeInvocationStore,
      runPinnedDetached: runPinnedDetachedPrompt,
      vault: dependencies.routingVault,
      workspaceRoot: settings.workspaceRoot,
      workState: durableWorkState,
    }),
    recordAgentRun: (input) => metadataStore.recordImplementationAgentRun(input),
  });
  const agentTaskRuntime = new AgentTaskRuntime({
    cancel: (runId) => { workflowPiProcessRegistry.cancel(runId); },
    registeredActionIds,
    resolvePlan: (actionId) => routeResolver.resolvePlan(actionId),
    runPrompt: runOneShotPiPrompt,
    runTimeoutMs: settings.runTimeoutMs,
    validateActionPlan,
    workspaceRoot: settings.workspaceRoot,
  });

  return {
    agentTaskRuntime,
    createDetachedCompletionWorkerApplication,
    directHostRuntimeEvidenceStore,
    implementationWorkerApplication,
    nestedWorkerActionApplications,
    runOneShotPiPrompt,
    routingPolicyService,
    routeResolver,
    runtimeEvidenceContext,
    runtimeInvocationStore,
    startTransitionStateRecorder,
    workflowConsoleApplication,
    workflowConsoleSummaryPresenter,
    workflowPiProcessRegistry,
  };
}

function findRuntimeParent(
  store: RuntimeInvocationStore,
  options: ImplementationWorkerPromptOptions,
): RuntimeInvocationEvidenceV1 | null {
  const result = store.listFeatureInvocations({
    schemaVersion: "runtime-execution/v1",
    projectId: options.cwd,
    cardKey: options.runtimeContext.cardKey,
    limit: 256,
  });
  if (!result.ok) throw new Error("RUNTIME_PERSISTENCE_FAILED");
  const parent = [...result.value].reverse().find((candidate) =>
    candidate.receipt.workflowRunId === options.workflowRunId
    && candidate.receipt.correlationId === options.workflowRunId
    && candidate.receipt.invocationKind === "root",
  );
  return parent ?? null;
}

function classifyNestedProcessFailure(error: unknown): PiAttemptProcessResult {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")
    || message.includes("stalled after") || message.includes("maximum runtime")) {
    return { status: "timed_out", exitCode: null, failureCode: "timed_out" };
  }
  if (message.includes("cancel")) {
    return { status: "cancelled", exitCode: null, failureCode: "cancelled" };
  }
  return { status: "failed", exitCode: null, failureCode: "provider_unavailable" };
}
