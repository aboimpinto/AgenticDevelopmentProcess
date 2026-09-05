import type { CardMetadataStore } from "@hepha/db";
import type {
  AddFeatureFindingDetailInput,
  FeatureWorkflowActionInput,
  FeatureWorkflowActionResponse,
  ProjectSummary,
  ResolveFeatureFindingInput,
  SubmitFeatureFindingInput,
  WorkItemCard,
} from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import { assertDeepDiveMetadataStoreEnabled } from "../../work-item-validation.js";

export interface HumanReviewFindingPhaseRef {
  fileName: string;
  number: number;
  path: string;
}

type FindingStore = Pick<
  CardMetadataStore,
  | "appendFeatureFindingDetail"
  | "closeFeatureFinding"
  | "createFeatureFinding"
  | "getFeatureFinding"
  | "listFeatureFindings"
  | "recordFeatureFindingAgentRun"
> & Pick<CardMetadataStore, "enabled">;

export interface FeatureFindingDependencies {
  readonly allPhasesResolved: (feature: WorkItemCard) => boolean;
  readonly appendDetail: (
    phase: HumanReviewFindingPhaseRef,
    detail: { content: string; findingId: string; submittedAt: string },
  ) => void;
  readonly appendFinding: (
    phase: HumanReviewFindingPhaseRef,
    finding: { content: string; findingId: string; submittedAt: string },
  ) => void;
  readonly acceptPhase: (feature: WorkItemCard, phase: HumanReviewFindingPhaseRef) => void;
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly createId: () => string;
  readonly ensureFindingPhase: (project: StoredProject, feature: WorkItemCard) => HumanReviewFindingPhaseRef;
  readonly ensureTaskChecklists: (phase: HumanReviewFindingPhaseRef) => void;
  readonly executeFinding: (input: {
    cardKey: string;
    featureExternalId: string;
    findingId: string;
    project: StoredProject;
    runId: string;
  }) => Promise<unknown>;
  readonly findFindingPhase: (feature: WorkItemCard) => HumanReviewFindingPhaseRef | null;
  readonly isPhaseAwaitingUser: (phase: HumanReviewFindingPhaseRef) => boolean;
  readonly markFindingSolved: (project: StoredProject, feature: WorkItemCard, findingId: string) => void;
  readonly metadataStore: FindingStore;
  readonly notifyChanged: (projectId: string, eventType: string, externalId: string) => void;
  readonly resolveImplementation: (
    input: FeatureWorkflowActionInput,
  ) => Promise<{ feature: WorkItemCard; project: StoredProject }>;
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
  readonly startCompletion: (project: StoredProject, feature: WorkItemCard) => Promise<boolean>;
  readonly toProjectSummary: (project: StoredProject) => ProjectSummary;
  readonly clock?: () => string;
}

export class FeatureFindingApplication {
  readonly #dependencies: FeatureFindingDependencies;

  constructor(dependencies: FeatureFindingDependencies) {
    this.#dependencies = dependencies;
  }

  async submit(input: SubmitFeatureFindingInput): Promise<FeatureWorkflowActionResponse> {
    assertDeepDiveMetadataStoreEnabled(this.#dependencies.metadataStore.enabled);
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    const content = normalizeFindingContent(input.content);
    this.#assertAvailable(feature);
    const cardKey = this.#dependencies.createCardKey(feature.kind, feature.externalId);
    const findingId = `finding-${this.#dependencies.createId()}`;
    const runId = `finding-${this.#dependencies.createId()}`;
    const phase = this.#dependencies.ensureFindingPhase(project, feature);

    await this.#dependencies.metadataStore.createFeatureFinding({
      cardKey,
      content,
      eventId: `event-${this.#dependencies.createId()}`,
      findingId,
      projectId: project.id,
      title: createFindingTitle(content),
    });
    this.#dependencies.appendFinding(phase, { content, findingId, submittedAt: this.#clock() });
    await this.#recordAgentRun(cardKey, findingId, project.id, runId, "Human review finding agent started.");
    void this.#dependencies.executeFinding({ cardKey, featureExternalId: feature.externalId, findingId, project, runId });
    this.#dependencies.notifyChanged(project.id, "finding.submitted", feature.externalId);
    return this.#response(project, `Finding submitted for ${feature.externalId}. Hepha is preparing a fix attempt.`);
  }

  async addDetail(input: AddFeatureFindingDetailInput): Promise<FeatureWorkflowActionResponse> {
    assertDeepDiveMetadataStoreEnabled(this.#dependencies.metadataStore.enabled);
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    const content = normalizeFindingContent(input.content);
    const cardKey = this.#dependencies.createCardKey(feature.kind, feature.externalId);
    const finding = await this.#dependencies.metadataStore.getFeatureFinding(project.id, cardKey, input.findingId);
    this.#assertAvailable(feature);
    if (!finding) throw new Error("Finding not found.");
    if (finding.status === "closed") {
      throw new Error("This finding is already closed. Submit a new finding for a separate issue.");
    }
    if (finding.status === "agent_running") {
      throw new Error("This finding already has an agent run in progress. Add more detail after the current response.");
    }

    const runId = `finding-${this.#dependencies.createId()}`;
    const phase = this.#dependencies.ensureFindingPhase(project, feature);
    await this.#dependencies.metadataStore.appendFeatureFindingDetail({
      cardKey,
      content,
      eventId: `event-${this.#dependencies.createId()}`,
      findingId: input.findingId,
      projectId: project.id,
    });
    this.#dependencies.appendDetail(phase, { content, findingId: input.findingId, submittedAt: this.#clock() });
    await this.#recordAgentRun(
      cardKey,
      input.findingId,
      project.id,
      runId,
      "Human review finding agent restarted with new user detail.",
    );
    void this.#dependencies.executeFinding({
      cardKey, featureExternalId: feature.externalId, findingId: input.findingId, project, runId,
    });
    this.#dependencies.notifyChanged(project.id, "finding.updated", feature.externalId);
    return this.#response(
      project,
      `Finding detail added for ${feature.externalId}. Hepha is retrying with the full finding thread.`,
    );
  }

  async resolve(input: ResolveFeatureFindingInput): Promise<FeatureWorkflowActionResponse> {
    assertDeepDiveMetadataStoreEnabled(this.#dependencies.metadataStore.enabled);
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    const cardKey = this.#dependencies.createCardKey(feature.kind, feature.externalId);
    const finding = await this.#dependencies.metadataStore.getFeatureFinding(project.id, cardKey, input.findingId);
    if (!finding) throw new Error("Finding not found.");
    if (finding.status === "agent_running") {
      throw new Error("Wait for the current finding agent run to finish before marking this finding solved.");
    }
    await this.#dependencies.metadataStore.closeFeatureFinding({
      cardKey,
      eventId: `event-${this.#dependencies.createId()}`,
      findingId: input.findingId,
      projectId: project.id,
    });
    this.#dependencies.markFindingSolved(project, feature, input.findingId);
    this.#dependencies.notifyChanged(project.id, "finding.closed", feature.externalId);
    const completionStarted = await this.#dependencies.startCompletion(project, feature);
    return this.#response(
      project,
      completionStarted
        ? `Finding marked solved for ${feature.externalId}. Complete Feature finalization started.`
        : `Finding marked solved for ${feature.externalId}.`,
    );
  }

  async acceptPhase(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = await this.#dependencies.resolveImplementation(input);
    const phase = this.#dependencies.findFindingPhase(feature);
    if (!phase) throw new Error("No Human Review Findings phase exists for this FEAT.");
    this.#dependencies.ensureTaskChecklists(phase);
    if (!this.#dependencies.isPhaseAwaitingUser(phase)) {
      throw new Error("Human Review Findings can be accepted only after the phase is awaiting user acceptance.");
    }

    const cardKey = this.#dependencies.createCardKey(feature.kind, feature.externalId);
    if (this.#dependencies.metadataStore.enabled) {
      const findings = (await this.#dependencies.metadataStore.listFeatureFindings(project.id, [cardKey])).get(cardKey) ?? [];
      const running = findings.find((finding) => finding.status === "agent_running");
      if (running) throw new Error(`Finding ${running.id} still has an agent run in progress.`);
      for (const finding of findings) {
        if (finding.status !== "closed") {
          await this.#dependencies.metadataStore.closeFeatureFinding({
            cardKey,
            eventId: `event-${this.#dependencies.createId()}`,
            findingId: finding.id,
            projectId: project.id,
          });
        }
      }
    }

    this.#dependencies.acceptPhase(feature, phase);
    this.#dependencies.notifyChanged(project.id, "finding.phase-accepted", feature.externalId);
    const completionStarted = await this.#dependencies.startCompletion(project, feature);
    return {
      ...(await this.#response(
        project,
        completionStarted
          ? `Human Review Findings accepted for ${feature.externalId}. Complete Feature finalization started.`
          : `Human Review Findings accepted for ${feature.externalId}.`,
      )),
      filesChanged: [phase.path],
    };
  }

  #assertAvailable(feature: WorkItemCard): void {
    if (!this.#dependencies.allPhasesResolved(feature)) {
      throw new Error("Findings can be submitted only after every numbered phase is completed or skipped.");
    }
  }

  #clock(): string {
    return (this.#dependencies.clock ?? (() => new Date().toISOString()))();
  }

  async #recordAgentRun(cardKey: string, findingId: string, projectId: string, runId: string, summary: string) {
    await this.#dependencies.metadataStore.recordFeatureFindingAgentRun({
      cardKey,
      currentStep: "Analyzing user finding and applying scoped fix",
      findingId,
      projectId,
      runId,
      status: "agent_running",
      summary,
    });
  }

  async #response(project: StoredProject, summary: string): Promise<FeatureWorkflowActionResponse> {
    return {
      filesChanged: [], filesCreated: [], items: await this.#dependencies.scanProject(project),
      project: this.#dependencies.toProjectSummary(project), summary,
    };
  }
}

export function normalizeFindingContent(content: string): string {
  const normalized = content.trim();
  if (normalized.length < 5) throw new Error("Finding text must include enough detail for review.");
  return normalized;
}

export function createFindingTitle(content: string): string {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "Human review finding";
  return firstLine.length <= 92 ? firstLine : `${firstLine.slice(0, 91)}...`;
}
