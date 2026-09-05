import type { HandoffPlanV1, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export interface DetachedCompletionWorkerInput {
  agentName: string; agentRole: string; cardKey: string; feature: WorkItemCard; plan: HandoffPlanV1;
  phaseNumber: number | null; phaseTitle: string | null; project: StoredProject; prompt: string;
  runId: string; step: string;
}

/** Persists and launches one detached complete-feature worker without claiming premature completion. */
export class DetachedCompletionWorkerApplication {
  constructor(private readonly dependencies: {
    buildSessionFile: (input: { agentRole: string; agentRunId: string; runId: string }) => string;
    createId: () => string;
    formatFailure: (input: { agentName: string; agentRole: string; error: unknown; modelContext: string }) => string;
    afterSuccessfulCompletion?: (input: DetachedCompletionWorkerInput) => Promise<void>;
    launch: (prompt: string, plan: HandoffPlanV1, options: {
      cwd: string; implementationProfile: true; sessionFile: string; timeoutLabel: string; workflowRunId: string;
      runtimeContext: { cardKey: string; phaseExecutionContractId: null; phaseNumber: null; taskId: null; selectedLessonIds: readonly string[] };
    }) => Promise<{ pid?: number | null; completion?: Promise<{ ok: boolean }> }>;
    recordAgentRun: (input: { agentName: string; agentRole: string; cardKey: string; currentStep: string; error?: string; id: string; model: string; phaseNumber: number | null; phaseTitle: string | null; projectId: string; status: "running" | "failed"; summary: string; workflowRunId: string }) => Promise<void>;
  }) {}

  async launch(input: DetachedCompletionWorkerInput): Promise<string> {
    const id = `agent-${this.dependencies.createId()}`;
    const modelName = "not-recorded";
    await this.record(input, id, modelName, "running", "Detached complete-feature Pi skill is running.");
    try {
      const launch = await this.dependencies.launch(input.prompt, input.plan, {
        cwd: input.project.rootPath, implementationProfile: true,
        sessionFile: this.dependencies.buildSessionFile({ agentRole: input.agentRole, agentRunId: id, runId: input.runId }),
        timeoutLabel: "Detached complete-feature Pi run", workflowRunId: input.runId,
        runtimeContext: {
          cardKey: input.cardKey, phaseExecutionContractId: null, phaseNumber: null, taskId: null, selectedLessonIds: [],
        },
      });
      if (launch.completion && this.dependencies.afterSuccessfulCompletion) {
        void launch.completion.then(async (result) => {
          if (result.ok) await this.dependencies.afterSuccessfulCompletion!(input);
        }).catch(() => undefined);
      }
      const summary = `Detached complete-feature Pi skill launched${launch.pid ? ` as PID ${launch.pid}` : ""}.`;
      await this.record(input, id, modelName, "running", summary);
      return summary;
    } catch (error) {
      const message = this.dependencies.formatFailure({ agentName: input.agentName, agentRole: input.agentRole, error,
        modelContext: "plan-bound runtime" });
      await this.record(input, id, modelName, "failed", `${input.agentName} failed to launch.`, message).catch(() => undefined);
      throw new Error(message);
    }
  }

  private record(input: DetachedCompletionWorkerInput, id: string, model: string, status: "running" | "failed", summary: string, error?: string) {
    return this.dependencies.recordAgentRun({ agentName: input.agentName, agentRole: input.agentRole, cardKey: input.cardKey,
      currentStep: input.step, ...(error ? { error } : {}), id, model, phaseNumber: input.phaseNumber,
      phaseTitle: input.phaseTitle, projectId: input.project.id, status, summary, workflowRunId: input.runId });
  }
}
