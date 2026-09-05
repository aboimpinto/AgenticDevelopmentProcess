import { createHash } from "node:crypto";
import type { ProviderConnectionRecord, ProviderConnectionId } from "@hepha/shared";
import {
  RUNTIME_EXECUTION_SCHEMA_VERSION,
  canonicalizeHandoffPlanV1,
  isHandoffPlanV1,
  isRuntimeAttemptV1,
  isRuntimeInvocationReceiptV1,
  type HandoffPlanV1,
  type RuntimeAttemptKind,
  type RuntimeAttemptV1,
  type RuntimeInvocationEvidenceV1,
  type RuntimeInvocationReceiptV1,
  type RuntimeRouteChangeEventV1,
  type RuntimeSafeFailureCode,
} from "@hepha/shared";
import type { RuntimeInvocationStore } from "@hepha/db";
import type { SecretVaultAdapter } from "../../provider-connections/secret-vault.js";
import {
  IsolatedPiWorkerPreparationError,
  type IsolatedPiWorkerContext,
} from "./isolated-pi-worker-context.js";
import {
  isLegalRuntimeStepSelection,
  isRecoveryContextForSelection,
  isRuntimeAttemptContextV1,
  isRuntimeExecutorInput,
  isUsableRuntimeConnection,
  normalizePiAttemptProcessResult,
  runtimeAuthenticationFor,
  type PiAttemptProcessResult,
  type RuntimeAttemptContextV1,
  type RuntimeAuthenticationProjection,
  type RuntimeExecutorInput,
  type RuntimeRecoveryContextV1,
} from "./handoff-plan-execution-contracts.js";
export {
  isRuntimeAttemptContextV1,
  isRuntimeRecoveryContextV1,
  type PiAttemptProcessResult,
  type RuntimeAttemptContextV1,
  type RuntimeRecoveryContextV1,
} from "./handoff-plan-execution-contracts.js";

/* One process call receives only the selected route, isolated context, and safe recovery cursor. */
export interface PiAttemptProcessRequest {
  readonly approvedRoute: HandoffPlanV1["steps"][number]["route"];
  readonly providerId: string;
  readonly arguments: readonly string[];
  readonly environment: NodeJS.ProcessEnv;
  readonly configurationRoot: string;
  readonly sessionDirectory: string;
  readonly inputRef: string;
  readonly recoveryContext: RuntimeRecoveryContextV1 | null;
}

export class RuntimeAttemptExecutionStoppedError extends Error {
  constructor() { super("RUNTIME_ATTEMPT_EXECUTION_STOPPED"); }
}

export interface RuntimeAttemptExecutionHooks {
  /** Runs after the preparing attempt is durable and before isolated context or process work begins. */
  readonly beforeProcess?: (attempt: RuntimeAttemptV1) => Promise<void> | void;
}

export interface HandoffPlanExecutorDependencies {
  readonly connections: Pick<{ getConnection(id: ProviderConnectionId): ProviderConnectionRecord | null }, "getConnection">;
  readonly contextFactory: Pick<IsolatedPiWorkerContext, "prepare">;
  readonly createId: () => string;
  readonly now: () => string;
  readonly process: { execute(request: PiAttemptProcessRequest): Promise<PiAttemptProcessResult> };
  readonly providerIdForConnection: (connection: ProviderConnectionRecord) => string | null;
  readonly receipts: Pick<RuntimeInvocationStore,
    "appendRouteChange" | "getInvocation" | "openInvocation" | "startAttempt" | "markAttemptSpawned" | "settleAttempt" | "settleInvocation"
  >;
  readonly vault: Pick<SecretVaultAdapter, "readSecret">;
}

export type HandoffPlanAttemptResult =
  | { readonly ok: true; readonly attempt: RuntimeAttemptV1; readonly receipt: RuntimeInvocationReceiptV1; readonly output: string }
  | { readonly ok: false; readonly code: RuntimeExecutorErrorCode; readonly attempt: RuntimeAttemptV1 | null; readonly receipt: RuntimeInvocationReceiptV1 | null };

export type RuntimeExecutorErrorCode =
  | "RUNTIME_INVALID_PLAN" | "RUNTIME_INVALID_CONTEXT" | "RUNTIME_INVALID_STEP"
  | "RUNTIME_CONNECTION_UNAVAILABLE" | "RUNTIME_AUTH_UNAVAILABLE" | "RUNTIME_PROVIDER_UNSUPPORTED"
  | "RUNTIME_SECRET_READ_FAILED" | "RUNTIME_CONTEXT_PREPARATION_FAILED" | "RUNTIME_SPAWN_FAILED"
  | "RUNTIME_PERSISTENCE_FAILED" | "RUNTIME_CLEANUP_FAILED" | "RUNTIME_ATTEMPT_FAILED" | "RUNTIME_ATTEMPT_EXECUTION_STOPPED"
  | "RUNTIME_ATTEMPT_TIMED_OUT" | "RUNTIME_ATTEMPT_CANCELLED";

/** Executes exactly one selected step from a guarded handoff plan and records its authoritative lifecycle. */
export class HandoffPlanExecutor {
  constructor(private readonly dependencies: HandoffPlanExecutorDependencies) {}

  async executeAttempt(raw: unknown, hooks: RuntimeAttemptExecutionHooks = {}): Promise<HandoffPlanAttemptResult> {
    if (!isExecutorInput(raw)) return rejection("RUNTIME_INVALID_CONTEXT");
    if (!isHandoffPlanV1(raw.plan)) return rejection("RUNTIME_INVALID_PLAN");
    if (!isRuntimeExecutorInput(raw)) return rejection("RUNTIME_INVALID_CONTEXT");

    const input = raw;
    if (!isLegalRuntimeStepSelection(input) || !isRecoveryContextForSelection(input)) return rejection("RUNTIME_INVALID_STEP");
    if ((input.context.invocationKind === "root" && input.context.rootInvocationId !== input.invocationId)
      || (input.context.invocationKind === "nested" && input.context.rootInvocationId === input.invocationId)) {
      return rejection("RUNTIME_INVALID_CONTEXT");
    }
    const step = input.plan.steps[input.stepIndex]!;
    const openedAt = this.dependencies.now();
    const attemptId = this.dependencies.createId();
    const initialized = input.stepIndex === 0
      ? this.openPrimary(input, attemptId, openedAt)
      : this.openSecond(input, attemptId, openedAt);
    if (!initialized.ok) return rejection(initialized.code);
    const { receipt, preparing, routeChangeEvent } = initialized;

    const connection = this.dependencies.connections.getConnection(step.route.connectionId);
    if (!connection || !isUsableRuntimeConnection(connection, step.route.connectionId)) {
      return this.failPreparation(input, receipt, preparing, routeChangeEvent, "connection_unavailable", "RUNTIME_CONNECTION_UNAVAILABLE");
    }
    const providerId = this.dependencies.providerIdForConnection(connection);
    if (!safeProviderId(providerId)) {
      return this.failPreparation(input, receipt, preparing, routeChangeEvent, "provider_unsupported", "RUNTIME_PROVIDER_UNSUPPORTED");
    }
    const auth = runtimeAuthenticationFor(connection);
    if (!auth) {
      return this.failPreparation(input, receipt, preparing, routeChangeEvent, "auth_unavailable", "RUNTIME_AUTH_UNAVAILABLE");
    }

    const authenticatedPreparing: RuntimeAttemptV1 = {
      ...preparing,
      providerId,
      authenticationConnectionId: connection.connectionId,
      authenticationKind: auth.kind,
      credentialVersion: auth.kind === "injected_connection_secret" ? auth.version : null,
    };
    const started = this.dependencies.receipts.startAttempt({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      attempt: authenticatedPreparing,
      routeChangeEvent,
    });
    if (!started.ok) return rejection("RUNTIME_PERSISTENCE_FAILED", null, receipt);

    try {
      await hooks.beforeProcess?.(authenticatedPreparing);
    } catch (error) {
      const stopped = error instanceof RuntimeAttemptExecutionStoppedError;
      return this.settleStartedPreparation(
        input,
        receipt,
        authenticatedPreparing,
        routeChangeEvent,
        stopped ? "invalid_input" : "persistence_failed",
        stopped ? "RUNTIME_ATTEMPT_EXECUTION_STOPPED" : "RUNTIME_PERSISTENCE_FAILED",
      );
    }

    let isolated: Awaited<ReturnType<IsolatedPiWorkerContext["prepare"]>>;
    try {
      isolated = await this.dependencies.contextFactory.prepare({ attemptId, connection, providerId, route: step.route });
    } catch (error) {
      const cleanupFailed = error instanceof IsolatedPiWorkerPreparationError && !error.cleanupSucceeded;
      return this.settleStartedPreparation(
        input,
        receipt,
        authenticatedPreparing,
        routeChangeEvent,
        cleanupFailed ? "cleanup_failed" : "context_preparation_failed",
        cleanupFailed ? "RUNTIME_CLEANUP_FAILED" : "RUNTIME_CONTEXT_PREPARATION_FAILED",
      );
    }

    let secret: string | undefined;
    if (auth.kind === "injected_connection_secret") {
      try {
        const value = await this.dependencies.vault.readSecret(auth.secretRef);
        if (!value) {
          const cleaned = await safeCleanup(isolated);
          return this.settleStartedPreparation(
            input, receipt, authenticatedPreparing, routeChangeEvent,
            cleaned ? "secret_read_failed" : "cleanup_failed",
            cleaned ? "RUNTIME_SECRET_READ_FAILED" : "RUNTIME_CLEANUP_FAILED",
          );
        }
        secret = value;
      } catch {
        const cleaned = await safeCleanup(isolated);
        return this.settleStartedPreparation(
          input, receipt, authenticatedPreparing, routeChangeEvent,
          cleaned ? "secret_read_failed" : "cleanup_failed",
          cleaned ? "RUNTIME_SECRET_READ_FAILED" : "RUNTIME_CLEANUP_FAILED",
        );
      }
    }

    let environment: NodeJS.ProcessEnv;
    try {
      environment = isolated.buildEnvironment(secret);
    } catch {
      const cleaned = await safeCleanup(isolated);
      return this.settleStartedPreparation(
        input, receipt, authenticatedPreparing, routeChangeEvent,
        cleaned ? "context_preparation_failed" : "cleanup_failed",
        cleaned ? "RUNTIME_CONTEXT_PREPARATION_FAILED" : "RUNTIME_CLEANUP_FAILED",
      );
    } finally {
      secret = undefined;
    }

    const spawnedAt = this.dependencies.now();
    const running: RuntimeAttemptV1 = {
      ...authenticatedPreparing,
      actualRoute: step.route,
      status: "running",
      startedAt: spawnedAt,
      spawnedAt,
    };
    const marked = this.dependencies.receipts.markAttemptSpawned(running);
    if (!marked.ok) {
      const cleaned = await safeCleanup(isolated);
      if (!cleaned) {
        return this.settleStartedPreparation(input, receipt, authenticatedPreparing, routeChangeEvent, "cleanup_failed", "RUNTIME_CLEANUP_FAILED");
      }
      return rejection("RUNTIME_PERSISTENCE_FAILED", authenticatedPreparing, receipt);
    }

    let processResult: PiAttemptProcessResult;
    try {
      processResult = await this.dependencies.process.execute({
        approvedRoute: step.route,
        providerId,
        arguments: ["--provider", providerId, "--model", step.route.modelId],
        environment,
        configurationRoot: isolated.configurationRoot,
        sessionDirectory: isolated.sessionDirectory,
        inputRef: input.inputRef,
        recoveryContext: input.recoveryContext ?? null,
      });
    } catch {
      processResult = { status: "failed", exitCode: null, failureCode: "spawn_failed" };
    }
    environment = {};

    const cleaned = await safeCleanup(isolated);
    const normalized = normalizePiAttemptProcessResult(processResult);
    const effective = cleaned ? normalized : {
      status: "failed" as const,
      exitCode: normalized.exitCode,
      failureCode: "cleanup_failed" as const,
      output: "",
    };
    const terminalAt = this.dependencies.now();
    const latest = this.readCurrentAttempt(input.invocationId, attemptId) ?? running;
    const terminal: RuntimeAttemptV1 = {
      ...latest,
      status: effective.status,
      terminalAt,
      durationMs: elapsed(latest.preparationStartedAt, terminalAt),
      exitCode: effective.exitCode,
      timeoutMarker: effective.status === "timed_out",
      failureCode: effective.status === "completed" ? null : effective.failureCode,
    };
    const code = !cleaned ? "RUNTIME_CLEANUP_FAILED"
      : effective.status === "timed_out" ? "RUNTIME_ATTEMPT_TIMED_OUT"
        : effective.status === "cancelled" ? "RUNTIME_ATTEMPT_CANCELLED"
          : effective.failureCode === "spawn_failed" ? "RUNTIME_SPAWN_FAILED" : "RUNTIME_ATTEMPT_FAILED";
    return this.finishAttempt(input, receipt, terminal, routeChangeEvent, code, effective.output);
  }

  private openPrimary(input: ExecutorInput, attemptId: string, openedAt: string): AttemptInitialization {
    const receipt = createRunningReceipt(input, attemptId, openedAt);
    if (!receipt) return { ok: false, code: "RUNTIME_INVALID_PLAN" };
    const opened = this.dependencies.receipts.openInvocation({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      plan: input.plan,
      receipt,
    });
    if (!opened.ok) return { ok: false, code: "RUNTIME_PERSISTENCE_FAILED" };
    return {
      ok: true,
      receipt,
      preparing: createPreparingAttempt(attemptId, receipt.invocationId, input.plan.steps[0]!.route, openedAt, 0, "primary"),
      routeChangeEvent: null,
    };
  }

  private openSecond(input: ExecutorInput, attemptId: string, openedAt: string): AttemptInitialization {
    const current = this.dependencies.receipts.getInvocation(input.invocationId);
    if (!current.ok || current.value === null || !isLegalSecondAttemptState(current.value, input)) {
      return { ok: false, code: current.ok ? "RUNTIME_INVALID_STEP" : "RUNTIME_PERSISTENCE_FAILED" };
    }
    const primary = current.value.attempts[0]!;
    const event: RuntimeRouteChangeEventV1 = {
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      eventId: this.dependencies.createId(),
      invocationId: input.invocationId,
      eventIndex: 0,
      sourceInvocationId: input.invocationId,
      sourceAttemptId: primary.attemptId,
      targetInvocationId: input.invocationId,
      targetAttemptId: attemptId,
      kind: input.attemptKind as "fallback" | "recovery",
      reasonCode: primary.failureCode!,
      occurredAt: openedAt,
      sourceApprovedRoute: primary.approvedRoute,
      targetApprovedRoute: input.plan.steps[1]!.route,
      result: "started",
    };
    return {
      ok: true,
      receipt: current.value.receipt,
      preparing: createPreparingAttempt(attemptId, input.invocationId, input.plan.steps[1]!.route, openedAt, 1, input.attemptKind),
      routeChangeEvent: event,
    };
  }

  private settleStartedPreparation(
    input: ExecutorInput,
    receipt: RuntimeInvocationReceiptV1,
    preparing: RuntimeAttemptV1,
    routeChangeEvent: RuntimeRouteChangeEventV1 | null,
    failureCode: RuntimeSafeFailureCode,
    code: RuntimeExecutorErrorCode,
  ): HandoffPlanAttemptResult {
    const terminalAt = this.dependencies.now();
    const terminal: RuntimeAttemptV1 = {
      ...preparing,
      status: "failed",
      terminalAt,
      durationMs: elapsed(preparing.preparationStartedAt, terminalAt),
      failureCode,
    };
    return this.finishAttempt(input, receipt, terminal, routeChangeEvent, code, "");
  }

  private failPreparation(
    input: ExecutorInput,
    receipt: RuntimeInvocationReceiptV1,
    preparing: RuntimeAttemptV1,
    routeChangeEvent: RuntimeRouteChangeEventV1 | null,
    failureCode: RuntimeSafeFailureCode,
    code: RuntimeExecutorErrorCode,
  ): HandoffPlanAttemptResult {
    const started = this.dependencies.receipts.startAttempt({
      schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
      attempt: preparing,
      routeChangeEvent,
    });
    if (!started.ok) return rejection("RUNTIME_PERSISTENCE_FAILED", null, receipt);
    return this.settleStartedPreparation(input, receipt, preparing, routeChangeEvent, failureCode, code);
  }

  private finishAttempt(
    input: ExecutorInput,
    receipt: RuntimeInvocationReceiptV1,
    terminal: RuntimeAttemptV1,
    routeChangeEvent: RuntimeRouteChangeEventV1 | null,
    failureCode: RuntimeExecutorErrorCode,
    output: string,
  ): HandoffPlanAttemptResult {
    if (!isRuntimeAttemptV1(terminal) || !this.dependencies.receipts.settleAttempt(terminal).ok) {
      return rejection("RUNTIME_PERSISTENCE_FAILED", terminal, receipt);
    }
    const persisted = this.dependencies.receipts.getInvocation(input.invocationId);
    if (!persisted.ok || persisted.value === null) return rejection("RUNTIME_PERSISTENCE_FAILED", terminal, receipt);
    let currentReceipt = persisted.value.receipt;
    if (routeChangeEvent) {
      const completedEvent = { ...routeChangeEvent, result: terminal.status === "completed" ? "completed" : "failed" } as const;
      if (!this.dependencies.receipts.appendRouteChange(completedEvent).ok) {
        return rejection("RUNTIME_PERSISTENCE_FAILED", terminal, currentReceipt);
      }
      const updated = this.dependencies.receipts.getInvocation(input.invocationId);
      if (!updated.ok || updated.value === null) return rejection("RUNTIME_PERSISTENCE_FAILED", terminal, currentReceipt);
      currentReceipt = updated.value.receipt;
    }
    const leaveOpen = input.stepIndex === 0 && input.plan.steps.length === 2 && terminal.status !== "completed";
    if (leaveOpen) return rejection(failureCode, terminal, currentReceipt);
    const settled = settleReceipt(currentReceipt, terminal, this.dependencies.now());
    if (!this.dependencies.receipts.settleInvocation(settled).ok) {
      return rejection("RUNTIME_PERSISTENCE_FAILED", terminal, currentReceipt);
    }
    return terminal.status === "completed"
      ? { ok: true, attempt: terminal, receipt: settled, output }
      : rejection(failureCode, terminal, settled);
  }

  private readCurrentAttempt(invocationId: string, attemptId: string): RuntimeAttemptV1 | null {
    const current = this.dependencies.receipts.getInvocation(invocationId);
    if (!current.ok || current.value === null) return null;
    return current.value.attempts.find((attempt) => attempt.attemptId === attemptId) ?? null;
  }
}

type ExecutorInput = RuntimeExecutorInput;

type AttemptInitialization =
  | { readonly ok: false; readonly code: RuntimeExecutorErrorCode }
  | {
    readonly ok: true;
    readonly receipt: RuntimeInvocationReceiptV1;
    readonly preparing: RuntimeAttemptV1;
    readonly routeChangeEvent: RuntimeRouteChangeEventV1 | null;
  };

function isExecutorInput(value: unknown): value is Record<string, unknown> {
  if (!record(value)) return false;
  const keys = ["plan", "stepIndex", "attemptKind", "invocationId", "context", "inputRef"];
  if (Object.hasOwn(value, "recoveryContext")) keys.push("recoveryContext");
  return exactKeys(value, keys);
}

function createRunningReceipt(input: ExecutorInput, attemptId: string, openedAt: string): RuntimeInvocationReceiptV1 | null {
  const canonicalPlan = canonicalizeHandoffPlanV1(input.plan);
  if (canonicalPlan === null) return null;
  const receipt: RuntimeInvocationReceiptV1 = {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    invocationId: input.invocationId,
    rootInvocationId: input.context.rootInvocationId,
    parentInvocationId: input.context.parentInvocationId,
    invocationKind: input.context.invocationKind,
    planHash: createHash("sha256").update(canonicalPlan, "utf8").digest("hex"),
    actionId: input.plan.resolvedRoute.action.actionId,
    actionType: input.plan.resolvedRoute.action.actionType,
    roleId: input.plan.resolvedRoute.action.roleId,
    promptVersion: input.plan.resolvedRoute.action.promptVersion,
    policySource: input.plan.resolvedRoute.policySource,
    revisionId: input.plan.resolvedRoute.revisionId,
    approvedPrimaryRoute: input.plan.steps[0]!.route,
    approvedSecondRoute: input.plan.steps[1]?.route ?? null,
    projectId: input.context.projectId,
    cardKey: input.context.cardKey,
    workflowRunId: input.context.workflowRunId,
    workflowNodeId: input.context.workflowNodeId,
    phaseExecutionContractId: input.context.phaseExecutionContractId,
    phaseNumber: input.context.phaseNumber,
    taskId: input.context.taskId,
    correlationId: input.context.correlationId,
    selectedLessonIds: input.context.selectedLessonIds,
    attemptIds: [attemptId],
    routeChangeEventIds: [],
    status: "running",
    openedAt,
    settledAt: null,
    durationMs: null,
    failureCode: null,
  };
  return isRuntimeInvocationReceiptV1(receipt) ? receipt : null;
}

function createPreparingAttempt(
  attemptId: string,
  invocationId: string,
  route: HandoffPlanV1["steps"][number]["route"],
  preparationStartedAt: string,
  attemptIndex: 0 | 1,
  attemptKind: RuntimeAttemptKind,
  providerId: string | null = null,
  connection: ProviderConnectionRecord | null = null,
  auth: RuntimeAuthenticationProjection | null = null,
): RuntimeAttemptV1 {
  return {
    schemaVersion: RUNTIME_EXECUTION_SCHEMA_VERSION,
    attemptId,
    invocationId,
    attemptIndex,
    attemptKind,
    approvedRoute: route,
    actualRoute: null,
    providerId,
    authenticationConnectionId: connection?.connectionId ?? null,
    authenticationKind: auth?.kind ?? null,
    credentialVersion: auth?.kind === "injected_connection_secret" ? auth.version : null,
    workState: "none",
    checkpointId: null,
    checkpointCursor: null,
    status: "preparing",
    preparationStartedAt,
    startedAt: null,
    spawnedAt: null,
    terminalAt: null,
    durationMs: null,
    exitCode: null,
    timeoutMarker: false,
    failureCode: null,
  };
}

function isLegalSecondAttemptState(evidence: RuntimeInvocationEvidenceV1, input: ExecutorInput): boolean {
  const { receipt, attempts, routeChangeEvents } = evidence;
  const primary = attempts[0];
  if (receipt.invocationId !== input.invocationId || receipt.status !== "running"
    || receipt.attemptIds.length !== 1 || receipt.routeChangeEventIds.length !== 0
    || routeChangeEvents.length !== 0 || attempts.length !== 1 || !primary
    || primary.status === "completed" || primary.status === "running" || primary.status === "preparing"
    || primary.failureCode === null || receipt.approvedSecondRoute === null) return false;
  if (input.attemptKind === "fallback") return primary.workState === "none";
  return input.attemptKind === "recovery" && primary.workState === "checkpointed"
    && primary.checkpointId === input.recoveryContext?.checkpointId
    && primary.checkpointCursor === input.recoveryContext?.checkpointCursor;
}

function settleReceipt(receipt: RuntimeInvocationReceiptV1, attempt: RuntimeAttemptV1, settledAt: string): RuntimeInvocationReceiptV1 {
  const status = attempt.status === "completed" ? "completed"
    : attempt.status === "timed_out" ? "timed_out"
      : attempt.status === "cancelled" ? "cancelled" : "failed";
  return {
    ...receipt,
    status,
    settledAt,
    durationMs: elapsed(receipt.openedAt, settledAt),
    failureCode: attempt.failureCode,
  };
}

async function safeCleanup(context: { cleanup(): Promise<boolean> }): Promise<boolean> {
  try { return await context.cleanup(); } catch { return false; }
}

function rejection(code: RuntimeExecutorErrorCode, attempt: RuntimeAttemptV1 | null = null, receipt: RuntimeInvocationReceiptV1 | null = null): HandoffPlanAttemptResult {
  return { ok: false, code, attempt, receipt };
}
function elapsed(start: string, end: string): number { return new Date(end).getTime() - new Date(start).getTime(); }
function safeProviderId(value: unknown): value is string { return text(value, 256); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value); return actual.length === keys.length && actual.every((key) => keys.includes(key)); }
function text(value: unknown, maximum: number): value is string { return typeof value === "string" && value.length > 0 && value.length <= maximum && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value); }
