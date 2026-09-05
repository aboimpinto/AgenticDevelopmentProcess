import { randomUUID } from "node:crypto";
import { isHandoffPlanV1, type AgentActionId, type AgentEvent, type AgentTask, type CreateAgentTaskInput, type HandoffPlanV1 } from "@hepha/shared";
import { buildAgentPrompt } from "./pi-argument-builder.js";

export interface AgentTaskRuntimeConfig {
  cancel(runId: string): void;
  registeredActionIds: readonly AgentActionId[];
  resolvePlan(actionId: AgentActionId): HandoffPlanV1;
  runPrompt(prompt: string, plan: HandoffPlanV1, options: {
    cwd: string;
    timeoutLabel: string;
    timeoutMs: number;
    workflowRunId: string;
  }): Promise<string>;
  runTimeoutMs: number;
  validateActionPlan(actionId: AgentActionId, plan: HandoffPlanV1): boolean;
  workspaceRoot: string;
}

/** Owns queued dashboard agent tasks while delegating every launch to the required plan-bound runner. */
export class AgentTaskRuntime {
  readonly #activeRuns = new Map<string, number>();
  readonly #config: AgentTaskRuntimeConfig;
  readonly #plans = new Map<string, HandoffPlanV1>();
  readonly #tasks = new Map<string, AgentTask>();
  #nextTaskNumber = 120;

  constructor(config: AgentTaskRuntimeConfig) {
    this.#config = config;
  }

  create(input: CreateAgentTaskInput): AgentTask {
    if (!isCreateAgentTaskInput(input)) throw new Error("AGENT_DISPATCH_INVALID");
    if (!this.#config.registeredActionIds.includes(input.agent_action)) throw new Error("AGENT_ACTION_UNKNOWN");
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error("Prompt is required");

    const plan = this.#config.resolvePlan(input.agent_action);
    if (!isHandoffPlanV1(plan) || plan.resolvedRoute.action.actionId !== input.agent_action
      || !this.#config.validateActionPlan(input.agent_action, plan)) {
      throw new Error("RUNTIME_INVALID_PLAN");
    }
    const taskNumber = this.#nextTaskNumber++;
    const id = `ADP-${taskNumber}`;
    const runId = `RUN-${taskNumber}`;
    const agent = input.agent?.trim() || "ForgeRunner";
    const task: AgentTask = {
      id,
      title: input.title?.trim() || `Agent run ${taskNumber}`,
      state: "Submitted",
      agent,
      latestActivity: "Queued by local orchestrator",
      eventCount: 1,
      age: "Just now",
      columnId: "submitted",
      createdAt: Date.now(),
      events: [createEvent(runId, "job.created", "FEAT Card Created", `The orchestrator created ${id}.`, "neutral")],
      model: plan.resolvedRoute.route.modelId,
      prompt,
      runId,
      status: "queued",
    };
    this.#plans.set(id, plan);
    this.#tasks.set(id, task);
    return task;
  }

  find(taskId: string): AgentTask | undefined { return this.#tasks.get(taskId); }
  list(): AgentTask[] { return [...this.#tasks.values()].sort((left, right) => right.createdAt - left.createdAt); }
  hasActiveRuns(): boolean { return this.#activeRuns.size > 0; }

  start(taskId: string): void {
    const task = this.#tasks.get(taskId);
    const plan = this.#plans.get(taskId);
    if (!task || task.status !== "queued" || !plan) return;
    void this.#run(task, plan);
  }

  cancel(taskId: string): void {
    const task = this.#tasks.get(taskId);
    if (!task || task.status !== "running") return;
    this.#config.cancel(task.runId);
    this.#activeRuns.delete(taskId);
    this.#patch(taskId, {
      age: "Just now", columnId: "done", latestActivity: "Agent run cancelled",
      output: "The Pi run was cancelled before it returned a final response.", progress: 100,
      state: "Cancelled", status: "cancelled",
    });
    this.#addEvent(taskId, createEvent(task.runId, "agent.cancelled", "Run Cancelled", "Cancelled by user.", "neutral"));
  }

  async #run(task: AgentTask, plan: HandoffPlanV1): Promise<void> {
    const startedAt = Date.now();
    this.#activeRuns.set(task.id, startedAt);
    this.#patch(task.id, {
      age: "Just now", columnId: "execute", latestActivity: "Starting plan-bound Pi agent process",
      progress: 12, state: "Execute", status: "running",
    });
    this.#addEvent(task.id, createEvent(
      task.runId, "agent.started", "Pi Agent Started",
      `${task.agent} started with ${plan.resolvedRoute.route.modelId}.`, "action",
    ));
    try {
      this.#addEvent(task.id, createEvent(task.runId, "process.spawned", "Pi Process Spawned", "Started the pinned plan-bound Pi process.", "neutral"));
      const output = await this.#config.runPrompt(buildAgentPrompt(task), plan, {
        cwd: this.#config.workspaceRoot,
        timeoutLabel: "Agent task Pi run",
        timeoutMs: this.#config.runTimeoutMs,
        workflowRunId: task.runId,
      });
      if (this.#tasks.get(task.id)?.status === "cancelled") return;
      this.#addEvent(task.id, createEvent(task.runId, "agent.output.started", "Output Streaming", "Pi returned model output for this task.", "action"));
      const duration = formatDuration(Date.now() - startedAt);
      this.#patch(task.id, {
        age: "Just now", columnId: "done", duration, latestActivity: "Completed with Pi output",
        output, progress: 100, state: "Done", status: "completed", tokens: estimateTokens(task.prompt, output),
      });
      this.#addEvent(task.id, createEvent(task.runId, "agent.completed", "Run Completed", `Pi finished the run in ${duration}.`, "live"));
    } catch (error) {
      if (this.#tasks.get(task.id)?.status !== "cancelled") {
        this.#fail(task, error instanceof Error ? error.message : "Unknown Pi execution error");
      }
    } finally {
      this.#activeRuns.delete(task.id);
    }
  }

  #fail(task: AgentTask, message: string): void {
    this.#activeRuns.delete(task.id);
    this.#patch(task.id, {
      age: "Just now", columnId: "done", latestActivity: "Agent run failed", output: message,
      progress: 100, state: "Cancelled", status: "failed",
    });
    this.#addEvent(task.id, createEvent(task.runId, "agent.failed", "Run Failed", message, "neutral"));
  }

  #patch(taskId: string, patch: Partial<AgentTask>): void {
    const task = this.#tasks.get(taskId);
    if (task) this.#tasks.set(taskId, { ...task, ...patch });
  }

  #addEvent(taskId: string, event: AgentEvent): void {
    const task = this.#tasks.get(taskId);
    if (!task) return;
    const events = [event, ...task.events];
    this.#tasks.set(taskId, { ...task, eventCount: events.length, events });
  }
}

function createEvent(runId: string, type: string, title: string, detail: string, tone: AgentEvent["tone"]): AgentEvent {
  return { id: `${runId}-${randomUUID()}`, type, title, detail, time: "Just now", tone };
}
function estimateTokens(prompt: string, output: string): string {
  const estimated = Math.ceil((prompt.length + output.length) / 4);
  return estimated >= 1000 ? `${(estimated / 1000).toFixed(1)}k` : `${estimated}`;
}
function isCreateAgentTaskInput(value: unknown): value is CreateAgentTaskInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  const allowed = ["agent_action", "agent", "prompt", "title"];
  return Object.keys(input).every((key) => allowed.includes(key))
    && typeof input.agent_action === "string" && /^[a-z][a-z0-9-]*$/u.test(input.agent_action)
    && typeof input.prompt === "string"
    && (input.agent === undefined || typeof input.agent === "string")
    && (input.title === undefined || typeof input.title === "string");
}
function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}
