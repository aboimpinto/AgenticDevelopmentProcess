import { randomUUID } from "node:crypto";
import type { ProviderConnectionRecord, HandoffPlanV1 } from "@hepha/shared";
import type { RuntimeInvocationStore } from "@hepha/db";
import type { SecretVaultAdapter } from "../../provider-connections/secret-vault.js";
import {
  HandoffPlanExecutor,
  type PiAttemptProcessResult,
  type RuntimeAttemptContextV1,
} from "./handoff-plan-executor.js";
import type { IsolatedPiWorkerContext } from "./isolated-pi-worker-context.js";
import type { PiPromptRunOptions } from "./pi-argument-builder.js";
import type { PiJsonEvent } from "./pi-event-parser.js";
import type { PiDetachedLaunch, PinnedPiDetachedExecution } from "./pi-detached-runner.js";
import type { PinnedPiPromptLaunch } from "./pi-one-shot-runner.js";
import {
  RuntimeExecutionCoordinator,
  RuntimeInvocationDurableWorkStatePort,
  type DurableWorkStatePort,
  type RuntimeExecutionResult,
} from "./runtime-execution-coordinator.js";
import { presentRuntimeRouteFailure } from "./runtime-route-failure-presentation.js";

export interface PlanBoundPiPromptRunOptions extends PiPromptRunOptions {
  readonly runtimeContext?: Partial<Pick<RuntimeAttemptContextV1,
    "cardKey" | "phaseExecutionContractId" | "phaseNumber" | "taskId" | "workflowNodeId" | "selectedLessonIds"
  >>;
}

export interface PlanBoundPiPromptRunnerDependencies {
  readonly connections: HandoffPlanExecutorConstructorDependencies["connections"];
  readonly contextFactory: Pick<IsolatedPiWorkerContext, "prepare">;
  readonly now?: () => string;
  readonly providerIdForConnection: (connection: ProviderConnectionRecord) => string | null;
  readonly receipts: Pick<RuntimeInvocationStore,
    "appendRouteChange" | "getInvocation" | "openInvocation" | "startAttempt" | "markAttemptSpawned"
    | "markSubstantiveWorkStarted" | "recordCheckpoint" | "settleAttempt" | "settleInvocation"
  >;
  readonly runPinnedPrompt: (
    prompt: string,
    launch: PinnedPiPromptLaunch,
    options?: PiPromptRunOptions,
  ) => Promise<string>;
  readonly vault: Pick<SecretVaultAdapter, "readSecret">;
  readonly workspaceRoot: string;
  readonly workState?: DurableWorkStatePort;
}

type HandoffPlanExecutorConstructorDependencies = ConstructorParameters<typeof HandoffPlanExecutor>[0];

export type PlanBoundPiPromptRunner = (
  prompt: string,
  plan: HandoffPlanV1,
  options?: PlanBoundPiPromptRunOptions,
) => Promise<string>;

/** Adapts all prompt workers to the guarded one-attempt plan executor without a model/default lane. */
export function createPlanBoundPiPromptRunner(
  dependencies: PlanBoundPiPromptRunnerDependencies,
): PlanBoundPiPromptRunner {
  return async (prompt, plan, options = {}) => {
    const invocationId = randomUUID();
    const context = createRuntimeContext(invocationId, dependencies.workspaceRoot, options);
    let activeAttemptId: string | null = null;
    const processFailure: { message: string | null } = { message: null };
    const mutationTracker = createRuntimeArtifactMutationTracker({
      activeAttemptId: () => activeAttemptId,
      invocationId,
      receipts: dependencies.receipts,
    });
    const executor = new HandoffPlanExecutor({
      connections: dependencies.connections,
      contextFactory: dependencies.contextFactory,
      createId: randomUUID,
      now: dependencies.now ?? (() => new Date().toISOString()),
      process: {
        execute: async (request): Promise<PiAttemptProcessResult> => {
          try {
            const output = await dependencies.runPinnedPrompt(prompt, {
              environment: request.environment,
              model: { provider: request.providerId, model: request.approvedRoute.modelId },
            }, {
              ...options,
              onPiEvent: (event) => {
                mutationTracker.observe(event);
                options.onPiEvent?.(event);
              },
            });
            return { status: "completed", exitCode: 0, failureCode: null, output };
          } catch (error) {
            processFailure.message = error instanceof Error ? error.message : "Pi worker process failed.";
            return classifyProcessFailure(error);
          }
        },
      },
      providerIdForConnection: dependencies.providerIdForConnection,
      receipts: dependencies.receipts,
      vault: dependencies.vault,
    });
    const coordinator = new RuntimeExecutionCoordinator({
      executor,
      now: dependencies.now ?? (() => new Date().toISOString()),
      receipts: dependencies.receipts,
      workState: dependencies.workState ?? new RuntimeInvocationDurableWorkStatePort(dependencies.receipts),
    });
    const result = await coordinator.execute({
      plan,
      invocationId,
      context,
      inputRef: `prompt:${invocationId}`,
    }, {
      beforeProcess: (attempt) => { activeAttemptId = attempt.attemptId; },
    });
    if (!result.ok) {
      if (processFailure.message) throw new Error(`${processFailure.message} Runtime route outcome: ${result.code}.`);
      throw new Error(presentRuntimeRouteFailure(
        result,
        plan,
        (connectionId) => dependencies.connections.getConnection(connectionId),
      ));
    }
    return result.attemptResult.output;
  };
}

export interface PlanBoundDetachedLaunch extends PiDetachedLaunch {
  readonly completion: Promise<RuntimeExecutionResult>;
}

/** Starts one detached plan-bound execution and exposes terminal receipt settlement to lifecycle composition. */
export function createPlanBoundDetachedPromptLauncher(
  dependencies: Omit<PlanBoundPiPromptRunnerDependencies, "runPinnedPrompt"> & {
    readonly runPinnedDetached: (
      prompt: string,
      launch: PinnedPiPromptLaunch,
      options?: PiPromptRunOptions,
    ) => Promise<PinnedPiDetachedExecution>;
  },
) {
  return async (prompt: string, plan: HandoffPlanV1, options: PlanBoundPiPromptRunOptions = {}): Promise<PlanBoundDetachedLaunch> => {
    const invocationId = randomUUID();
    let resolveLaunch!: (launch: PiDetachedLaunch) => void;
    let rejectLaunch!: (error: Error) => void;
    let launched = false;
    const launchPromise = new Promise<PiDetachedLaunch>((resolve, reject) => {
      resolveLaunch = resolve;
      rejectLaunch = reject;
    });
    const executor = new HandoffPlanExecutor({
      connections: dependencies.connections,
      contextFactory: dependencies.contextFactory,
      createId: randomUUID,
      now: dependencies.now ?? (() => new Date().toISOString()),
      process: {
        execute: async (request) => {
          const execution = await dependencies.runPinnedDetached(prompt, {
            environment: request.environment,
            model: { provider: request.providerId, model: request.approvedRoute.modelId },
          }, options);
          launched = true;
          resolveLaunch(execution.launch);
          const terminal = await execution.completion;
          return terminal.exitCode === 0 && terminal.signal === null
            ? { status: "completed", exitCode: 0, failureCode: null, output: "" }
            : { status: "failed", exitCode: terminal.exitCode, failureCode: "provider_unavailable" };
        },
      },
      providerIdForConnection: dependencies.providerIdForConnection,
      receipts: dependencies.receipts,
      vault: dependencies.vault,
    });
    const coordinator = new RuntimeExecutionCoordinator({
      executor,
      now: dependencies.now ?? (() => new Date().toISOString()),
      receipts: dependencies.receipts,
      workState: dependencies.workState ?? new RuntimeInvocationDurableWorkStatePort(dependencies.receipts),
    });
    const completion = coordinator.execute({
      plan,
      invocationId,
      context: createRuntimeContext(invocationId, dependencies.workspaceRoot, options),
      inputRef: `prompt:${invocationId}`,
    });
    void completion.then((result) => {
      if (!launched && !result.ok) rejectLaunch(new Error(result.code));
    }).catch((error: unknown) => {
      if (!launched) rejectLaunch(error instanceof Error ? error : new Error("RUNTIME_SPAWN_FAILED"));
    });
    const launch = await launchPromise;
    return { ...launch, completion };
  };
}

function createRuntimeContext(
  invocationId: string,
  workspaceRoot: string,
  options: PlanBoundPiPromptRunOptions,
): RuntimeAttemptContextV1 {
  const phaseExecutionContractId = options.runtimeContext?.phaseExecutionContractId ?? null;
  const phaseNumber = options.runtimeContext?.phaseNumber ?? null;
  return {
    projectId: safeProjectIdentity(options.cwd ?? workspaceRoot),
    cardKey: options.runtimeContext?.cardKey ?? null,
    workflowRunId: options.workflowRunId ?? null,
    workflowNodeId: options.runtimeContext?.workflowNodeId ?? null,
    phaseExecutionContractId,
    phaseNumber,
    taskId: options.runtimeContext?.taskId ?? null,
    correlationId: options.workflowRunId ?? invocationId,
    selectedLessonIds: [...(options.runtimeContext?.selectedLessonIds ?? [])].sort(),
    invocationKind: "root",
    rootInvocationId: invocationId,
    parentInvocationId: null,
  };
}

function safeProjectIdentity(value: string): string {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 512 ? trimmed : "hepha-project";
}

function createRuntimeArtifactMutationTracker(input: {
  activeAttemptId: () => string | null;
  invocationId: string;
  receipts: Pick<RuntimeInvocationStore, "getInvocation" | "markSubstantiveWorkStarted" | "recordCheckpoint">;
}) {
  const activeMutations = new Map<string, string>();
  return {
    observe(event: PiJsonEvent): void {
      const type = typeof event.type === "string" ? event.type : "";
      const toolName = typeof event.toolName === "string" ? event.toolName : "";
      const toolCallId = typeof event.toolCallId === "string" && event.toolCallId ? event.toolCallId : `${toolName}:anonymous`;
      if (type === "tool_execution_start" && (toolName === "write" || toolName === "edit")) {
        const path = event.args && typeof event.args === "object" && typeof (event.args as Record<string, unknown>).path === "string"
          ? String((event.args as Record<string, unknown>).path)
          : toolName;
        activeMutations.set(toolCallId, path);
        advanceRuntimeWork(input, "started", path);
        return;
      }
      if (type === "tool_execution_end" && activeMutations.has(toolCallId)) {
        const path = activeMutations.get(toolCallId)!;
        activeMutations.delete(toolCallId);
        if (!event.isError) advanceRuntimeWork(input, "checkpointed", path);
      }
    },
  };
}

function advanceRuntimeWork(
  input: {
    activeAttemptId: () => string | null;
    invocationId: string;
    receipts: Pick<RuntimeInvocationStore, "getInvocation" | "markSubstantiveWorkStarted" | "recordCheckpoint">;
  },
  target: "started" | "checkpointed",
  artifactPath: string,
): void {
  const attemptId = input.activeAttemptId();
  if (!attemptId) throw new Error("RUNTIME_PERSISTENCE_FAILED");
  const evidence = input.receipts.getInvocation(input.invocationId);
  const attempt = evidence.ok ? evidence.value?.attempts.find((candidate) => candidate.attemptId === attemptId) : null;
  if (!attempt || attempt.status !== "running") throw new Error("RUNTIME_PERSISTENCE_FAILED");
  if (target === "started") {
    if (attempt.workState !== "none") return;
    const result = input.receipts.markSubstantiveWorkStarted({
      ...attempt,
      workState: "started",
      checkpointId: null,
      checkpointCursor: null,
    });
    if (!result.ok) throw new Error("RUNTIME_PERSISTENCE_FAILED");
    return;
  }
  if (attempt.workState === "checkpointed") return;
  const started = attempt.workState === "started" ? attempt : (() => {
    const result = input.receipts.markSubstantiveWorkStarted({
      ...attempt,
      workState: "started" as const,
      checkpointId: null,
      checkpointCursor: null,
    });
    if (!result.ok) throw new Error("RUNTIME_PERSISTENCE_FAILED");
    return result.value;
  })();
  const cursor = `artifact:${artifactPath}`.slice(0, 512);
  const result = input.receipts.recordCheckpoint({
    ...started,
    workState: "checkpointed",
    checkpointId: randomUUID(),
    checkpointCursor: cursor,
  });
  if (!result.ok) throw new Error("RUNTIME_PERSISTENCE_FAILED");
}

function classifyProcessFailure(error: unknown): PiAttemptProcessResult {
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
