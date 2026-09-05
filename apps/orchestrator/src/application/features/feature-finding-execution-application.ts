import type { CardMetadataStore, StoredFeatureFinding } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerApplication } from "../../workflows/phases/implementation-worker-application.js";
import type { HumanReviewFindingPhaseRef } from "./feature-finding-application.js";

export interface FeatureFindingExecutionDependencies {
  appendAgentResult(
    feature: WorkItemCard,
    findingId: string,
    output: string,
    status: "AWAITING_USER_ACCEPTANCE" | "IN_PROGRESS",
  ): void;
  buildPrompt(
    project: StoredProject,
    feature: WorkItemCard,
    context: string,
    finding: StoredFeatureFinding,
    phase: HumanReviewFindingPhaseRef,
  ): string;
  chooseModel(): import("@hepha/shared").HandoffPlanV1;
  clock(): string;
  collectContext(
    project: StoredProject,
    feature: WorkItemCard,
    workItems: WorkItemCard[],
    phase: HumanReviewFindingPhaseRef,
  ): string;
  createId(): string;
  ensurePhase(feature: WorkItemCard): HumanReviewFindingPhaseRef;
  metadataStore: Pick<CardMetadataStore, "getFeatureFinding" | "recordFeatureFindingAgentRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  reportDocumentFailure(featureExternalId: string, error: unknown): void;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  summarizeOutput(output: string, fallback: string): string;
  worker: Pick<ImplementationWorkerApplication, "execute">;
}

export interface FeatureFindingExecutionInput {
  cardKey: string;
  featureExternalId: string;
  findingId: string;
  project: StoredProject;
  runId: string;
}

/** Executes one durable human-review finding repair and records its user-facing result. */
export class FeatureFindingExecutionApplication {
  constructor(private readonly dependencies: FeatureFindingExecutionDependencies) {}

  async execute({ cardKey, featureExternalId, findingId, project, runId }: FeatureFindingExecutionInput): Promise<void> {
    const step = "Analyzing user finding and applying scoped fix";
    try {
      await this.dependencies.metadataStore.recordFeatureFindingAgentRun({
        cardKey, currentStep: step, findingId, projectId: project.id, runId,
        status: "agent_running", summary: "Human review finding agent started.",
      });
      this.dependencies.notifyChanged(project.id, "finding.running", featureExternalId);

      const workItems = await this.dependencies.scanProject(project);
      const feature = workItems.find((item) => item.kind === "feature" && item.externalId === featureExternalId);
      const finding = await this.dependencies.metadataStore.getFeatureFinding(project.id, cardKey, findingId);
      if (!feature || !finding) throw new Error("Finding context disappeared before the agent could run.");

      const phase = this.dependencies.ensurePhase(feature);
      const context = this.dependencies.collectContext(project, feature, workItems, phase);
      const output = await this.dependencies.worker.execute({
        agentAction: "resolve-review-findings",
        agentName: "Human Review Finding Agent", agentRole: "human-review-finding", cardKey, feature,
        plan: this.dependencies.chooseModel(), phaseNumber: null, phaseTitle: "Human Review Finding",
        project, prompt: this.dependencies.buildPrompt(project, feature, context, finding, phase), runId, step,
      });

      this.dependencies.appendAgentResult(feature, findingId, output, "AWAITING_USER_ACCEPTANCE");
      await this.dependencies.metadataStore.recordFeatureFindingAgentRun({
        cardKey, currentStep: "Waiting for user verification",
        event: {
          content: output.trim(), createdAt: this.dependencies.clock(), id: `event-${this.dependencies.createId()}`,
          kind: "solution", role: "agent",
        },
        findingId, projectId: project.id, runId, status: "agent_response",
        summary: this.dependencies.summarizeOutput(output, "Finding agent returned a response."),
      });
      this.dependencies.notifyChanged(project.id, "finding.agent-response", featureExternalId);
    } catch (error) {
      await this.recordFailure({ cardKey, error, featureExternalId, findingId, project, runId });
    }
  }

  private async recordFailure(input: FeatureFindingExecutionInput & { error: unknown }): Promise<void> {
    const errorMessage = input.error instanceof Error ? input.error.message : String(input.error);
    try {
      const workItems = await this.dependencies.scanProject(input.project);
      const feature = workItems.find(
        (item) => item.kind === "feature" && item.externalId === input.featureExternalId,
      );
      if (feature) {
        this.dependencies.appendAgentResult(
          feature, input.findingId, `Finding agent failed: ${errorMessage}`, "IN_PROGRESS",
        );
      }
    } catch (phaseError) {
      this.dependencies.reportDocumentFailure(input.featureExternalId, phaseError);
    }

    await this.dependencies.metadataStore.recordFeatureFindingAgentRun({
      cardKey: input.cardKey, currentStep: "Waiting for user detail", error: errorMessage,
      event: {
        content: `Finding agent failed: ${errorMessage}`, createdAt: this.dependencies.clock(),
        id: `event-${this.dependencies.createId()}`, kind: "status", role: "system",
      },
      findingId: input.findingId, projectId: input.project.id, runId: input.runId,
      status: "open", summary: "Finding agent failed.",
    }).catch(() => undefined);
    this.dependencies.notifyChanged(input.project.id, "finding.failed", input.featureExternalId);
  }
}
