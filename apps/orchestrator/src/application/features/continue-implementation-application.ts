import type { CardMetadataStore } from "@hepha/db";
import type { FeatureWorkflowActionInput, FeatureWorkflowActionResponse, ProjectSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ContextPackRef, ContextStalenessFailure, ReceiptContextEntry } from "../../workflow-receipt.js";
import type { WorkflowTransitionReceiptPolicy } from "../../workflows/receipts/workflow-transition-receipt-policy.js";

interface ReadinessResult {
  ready: boolean;
  reasons: Array<{ blocking: boolean; code: string; message: string }>;
}

export interface ContinueImplementationRunInput {
  agentAction: "continue-implementing";
  autonomous: boolean;
  branchMessage: string;
  branchName: string;
  cardKey: string;
  command: "continue-implementing";
  feature: WorkItemCard;
  forcedRecoveryPhaseNumber: number | null;
  previousFailureBrief: string | null;
  project: StoredProject;
  recoveryAttempt: number;
  runId: string;
}

export interface ContinueImplementationDependencies {
  allPhasesResolved(feature: WorkItemCard): boolean;
  appendSnapshot(summary: string, context: ReceiptContextEntry[], packRefs: ContextPackRef[]): string;
  assertBranches(project: StoredProject, branchName: string): void;
  clearCancellation(runId: string): void;
  countGitCheckpoints(project: StoredProject, feature: WorkItemCard, branchName: string): number;
  countQualityGates(feature: WorkItemCard): number;
  createCardKey(kind: WorkItemCard["kind"], externalId: string): string;
  createId(): string;
  deriveBranchName(externalId: string, folderName: string | null): string;
  evaluateReadiness(feature: WorkItemCard): ReadinessResult;
  execute(input: ContinueImplementationRunInput): Promise<unknown>;
  findCurrentFeature(project: StoredProject, externalId: string, fallback: WorkItemCard): Promise<WorkItemCard>;
  findFailurePhase(brief: string): number | null;
  formatStaleness(externalId: string, failures: ContextStalenessFailure[]): string;
  hasHumanReviewPhase(feature: WorkItemCard): boolean;
  hasNumberedPhases(feature: WorkItemCard): boolean;
  hasUnresolvedHumanReview(feature: WorkItemCard): boolean;
  metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  readStaleness(summary: string | null | undefined, rootPath: string): ContextStalenessFailure[];
  receiptPolicy: Pick<WorkflowTransitionReceiptPolicy, "createContext" | "validate">;
  recoverDeepDive(
    project: StoredProject,
    feature: WorkItemCard,
  ): Promise<FeatureWorkflowActionResponse["deepDiveRecoverySession"] | null>;
  resolveImplementation(input: FeatureWorkflowActionInput): Promise<{ feature: WorkItemCard; project: StoredProject }>;
  resolvePreviousFailure(feature: WorkItemCard): string | null;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  toProjectSummary(project: StoredProject): ProjectSummary;
}

/** Validates and durably starts a continuation of an existing implementation lifecycle. */
export class ContinueImplementationApplication {
  constructor(private readonly dependencies: ContinueImplementationDependencies) {}

  async continue(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const resolved = await this.dependencies.resolveImplementation(input);
    let feature = resolved.feature;
    const { project } = resolved;
    this.assertBaseEligibility(feature);

    const missingQualityGateCount = this.dependencies.countQualityGates(feature);
    const branchName = this.dependencies.deriveBranchName(feature.externalId, feature.folderName ?? null);
    const missingGitCheckpointCount = this.dependencies.countGitCheckpoints(project, feature, branchName);
    if (!this.dependencies.hasNumberedPhases(feature) && !this.dependencies.hasHumanReviewPhase(feature)) {
      throw new Error("Continue implementation requires numbered phase files from refine-feature.");
    }
    if (this.dependencies.allPhasesResolved(feature)
      && !this.dependencies.hasUnresolvedHumanReview(feature)
      && missingQualityGateCount === 0
      && missingGitCheckpointCount === 0) {
      throw new Error(`${feature.externalId} already has all phases completed or skipped.`);
    }

    // Source-file changes do not reopen Deep-Dive. Unresolved validation
    // markers are the only clarification authority and are rejected by target
    // resolution before continuation reaches this execution boundary.
    feature = await this.dependencies.findCurrentFeature(project, feature.externalId, feature);
    const readiness = this.dependencies.evaluateReadiness(feature);
    if (!readiness.ready) {
      const reasons = readiness.reasons.filter((reason) => reason.blocking)
        .map((reason) => `  - [${reason.code}] ${reason.message}`).join("\n");
      throw new Error(`${feature.externalId} is not ready to continue implementation:\n${reasons}`);
    }

    const autonomous = input.autonomous !== false;
    const runId = `workflow-${this.dependencies.createId()}`;
    const cardKey = this.dependencies.createCardKey(feature.kind, feature.externalId);
    this.dependencies.assertBranches(project, branchName);
    const { context, packRefs } = this.dependencies.receiptPolicy.createContext(project, feature);
    const receiptError = this.dependencies.receiptPolicy.validate({
      cardKey, command: "continue-implementing", context, contextPackRefs: packRefs,
      stage: "continue-implementing", nextState: "03_IN_PROGRESS", projectId: project.id, projectRoot: project.rootPath,
    });
    if (receiptError) throw receiptError;

    const staleness = this.dependencies.readStaleness(feature.featureWorkflow?.lastRun?.summary, project.rootPath);
    if (staleness.length > 0) throw new Error(this.dependencies.formatStaleness(feature.externalId, staleness));
    const previousFailureBrief = this.dependencies.resolvePreviousFailure(feature);
    const forcedRecoveryPhaseNumber = this.dependencies.findFailurePhase(previousFailureBrief ?? "");
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey, command: "continue-implementing", currentNodeId: "refresh-current-feature",
      currentStep: autonomous && missingQualityGateCount > 0
        ? "Resolving missing phase quality gates"
        : autonomous ? "Resolving next implementation task" : "Preparing implementation continuation",
      projectId: project.id, runId, status: "running",
      summary: this.dependencies.appendSnapshot(`Continuing implementation for ${feature.externalId}.`, context, packRefs),
    });

    this.dependencies.clearCancellation(runId);
    void this.dependencies.execute({
      agentAction: "continue-implementing",
      autonomous, branchMessage: `Continuing implementation on verified FEAT branch ${branchName}.`,
      branchName, cardKey, command: "continue-implementing", feature, forcedRecoveryPhaseNumber,
      previousFailureBrief, project, recoveryAttempt: 0, runId,
    });
    this.dependencies.notifyChanged(project.id, "workflow.started", feature.externalId);
    return {
      filesChanged: [], filesCreated: [], items: await this.dependencies.scanProject(project),
      project: this.dependencies.toProjectSummary(project),
      summary: `Implementation continuation started for ${feature.externalId}.`,
    };
  }

  private assertBaseEligibility(feature: WorkItemCard): void {
    if (feature.featureWorkflow?.activeRun?.status === "running") {
      throw new Error(`${feature.externalId} already has a running ${feature.featureWorkflow.activeRun.command} workflow.`);
    }
    if (feature.stateFolder !== "03_IN_PROGRESS") throw new Error("Only IN_PROGRESS FEATs can continue implementation.");
    if (!(feature.featureWorkflow?.hasContinuationArtifacts
      ?? feature.featureWorkflow?.hasRefinementArtifacts)) {
      throw new Error("Continue implementation requires a valid execution contract, FeatureTasks inventory, and declared phase files.");
    }
  }
}
