import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { FeatureWorkflowCommand } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface PhaseExecutionAuditInput {
  agent: string;
  event: "phase_progress" | "pi_attempt_started" | "pi_attempt_finished";
  model: string;
  phaseNumber: number | null;
  phaseTitle: string | null;
  project: StoredProject;
  runId: string;
  status: string;
  workflowCommand?: FeatureWorkflowCommand;
}

/** Appends one deliberately narrow, secret-safe operational phase event. */
export function appendPhaseExecutionAudit(
  input: PhaseExecutionAuditInput,
  clock: () => string = () => new Date().toISOString(),
): void {
  const path = resolve(input.project.rootPath, "logs", "phase-execution.jsonl");
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({
    agent: input.agent,
    event: input.event,
    model: input.model,
    occurredAt: clock(),
    phaseNumber: input.phaseNumber,
    phaseTitle: input.phaseTitle,
    status: input.status,
    ...(input.workflowCommand ? { workflowCommand: input.workflowCommand } : {}),
    workflowRunId: input.runId,
  })}\n`, "utf8");
}
