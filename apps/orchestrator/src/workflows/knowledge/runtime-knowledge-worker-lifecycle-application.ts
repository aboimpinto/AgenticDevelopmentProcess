import type { HandoffPlanV1, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";

export interface RuntimeKnowledgeWorkerContext {
  cardKey: string;
  feature: WorkItemCard;
  parentPlan: HandoffPlanV1;
  project: StoredProject;
  runId: string;
  selectedLessonIds?: readonly string[];
}

export interface RuntimePhaseLessonsContext extends RuntimeKnowledgeWorkerContext {
  phaseExecutionContractId: string | null;
  phaseNumber: number;
  phaseTitle: string;
}

/** Dispatches the three knowledge lifecycles with bounded prompts and parent-correlated worker context. */
export class RuntimeKnowledgeWorkerLifecycleApplication {
  constructor(private readonly dependencies: {
    runFeatureLessonsWriter(input: ImplementationWorkerInput): Promise<string>;
    runPhaseLessonsCapture(input: ImplementationWorkerInput): Promise<string>;
    runPostCompleteLessonsCurator(input: ImplementationWorkerInput): Promise<string>;
  }) {}

  async capturePhase(input: RuntimePhaseLessonsContext): Promise<string> {
    return await this.dependencies.runPhaseLessonsCapture(this.workerInput(input, {
      agentAction: "phase-lessons-capture",
      agentName: "Phase Lessons Capture Agent",
      agentRole: "phase-lessons-capture-agent",
      phaseExecutionContractId: input.phaseExecutionContractId,
      phaseNumber: input.phaseNumber,
      phaseTitle: input.phaseTitle,
      prompt: [
        `Capture durable lessons for Phase ${input.phaseNumber} (${input.phaseTitle}) of ${input.feature.externalId}.`,
        "Read only this phase's evidence, failures, fixes, review decisions, and prevention candidates.",
        "Update only the phase's unstructured LessonsLearned narrative. Do not promote project rules, reopen workflow state, or edit Hepha-owned status, task, or gate fields.",
      ].join("\n"),
      step: `Capture phase lessons for ${input.phaseTitle}`,
    }));
  }

  async writeFeatureLessons(input: RuntimeKnowledgeWorkerContext): Promise<string> {
    return await this.dependencies.runFeatureLessonsWriter(this.workerInput(input, {
      agentAction: "feature-lessons-writer",
      agentName: "Feature Lessons Writer Agent",
      agentRole: "feature-lessons-writer-agent",
      phaseExecutionContractId: null,
      phaseNumber: null,
      phaseTitle: "Feature Lessons Writer",
      prompt: [
        `Compile the completed phase lesson and review evidence for ${input.feature.externalId}.`,
        `Create or update only MemoryBank/LessonsLearned/${input.feature.externalId.toLowerCase()}-lessons-learned.md as the raw per-feature audit document.`,
        "Do not mutate project Active rules, reopen the FEAT, or export any cross-project Second Brain artifact.",
      ].join("\n"),
      step: "Compile raw feature lessons",
    }));
  }

  async curateDetachedCompletion(
    input: Omit<RuntimeKnowledgeWorkerContext, "parentPlan"> & { plan: HandoffPlanV1 },
  ): Promise<void> {
    await this.curatePostComplete({ ...input, parentPlan: input.plan });
  }

  async curatePostComplete(input: RuntimeKnowledgeWorkerContext): Promise<string> {
    return await this.dependencies.runPostCompleteLessonsCurator(this.workerInput(input, {
      agentAction: "post-complete-lessons-curator",
      agentName: "Post-Complete LessonsLearned Curator Agent",
      agentRole: "post-complete-lessons-curator-agent",
      phaseExecutionContractId: null,
      phaseNumber: null,
      phaseTitle: "Post-Complete LessonsLearned Curator",
      prompt: [
        `Curate project-level Active rules from MemoryBank/LessonsLearned/${input.feature.externalId.toLowerCase()}-lessons-learned.md after ${input.feature.externalId} completion.`,
        "Create, update, merge, or supersede only project MemoryBank/LessonsLearned/Active rules with source references.",
        "The FEAT is immutable: do not reopen or edit its lifecycle state. Do not create or export a cross-project Second Brain candidate.",
      ].join("\n"),
      step: "Curate project Active lessons after feature completion",
    }));
  }

  private workerInput(
    input: RuntimeKnowledgeWorkerContext,
    details: Pick<ImplementationWorkerInput,
      "agentAction" | "agentName" | "agentRole" | "phaseExecutionContractId" | "phaseNumber" | "phaseTitle" | "prompt" | "step"
    >,
  ): ImplementationWorkerInput {
    return {
      ...details,
      cardKey: input.cardKey,
      feature: input.feature,
      plan: input.parentPlan,
      project: input.project,
      runId: input.runId,
      selectedLessonIds: [...new Set(input.selectedLessonIds ?? [])].sort(),
    };
  }
}
