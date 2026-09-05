import type { CardMetadataStore } from "@hepha/db";
import type { FeatureWorkflowActionInput, FeatureWorkflowActionResponse, ProjectSummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ContextPackRef, ReceiptContextEntry } from "../../workflow-receipt.js";
import type { WorkflowTransitionReceiptPolicy } from "../../workflows/receipts/workflow-transition-receipt-policy.js";

interface ReadinessResult {
  ready: boolean;
  reasons: Array<{ blocking: boolean; code: string; message: string }>;
}

export interface StartImplementationRunInput {
  autonomous: boolean;
  baseBranch: string;
  branchName: string;
  cardKey: string;
  deliveryPolicy: string;
  feature: WorkItemCard;
  forcedRecoveryPhaseNumber: number | null;
  previousFailureBrief: string | null;
  project: StoredProject;
  repoRoot: string;
  runId: string;
  startCommit: string;
  transitionOnly: boolean;
}

export interface StartImplementationDependencies {
  appendSnapshot(summary: string, context: ReceiptContextEntry[], packRefs: ContextPackRef[]): string;
  classifyConflicts(hasActiveRun: boolean, activeCommand: string | null): { hasConflict: boolean };
  classifyPrerequisites(
    ready: boolean,
    reasons: Array<{ code: string; message: string }>,
    hasConflict: boolean,
    activeCommand: string | null,
  ): { readyToProceed: boolean; blockingReasons: ReadonlyArray<{ code: string; message: string }> };
  clearCancellation(runId: string): void;
  createCardKey(kind: WorkItemCard["kind"], externalId: string): string;
  createId(): string;
  deriveBranchName(externalId: string, folderName: string | null): string;
  evaluateReadiness(feature: WorkItemCard): ReadinessResult;
  execute(input: StartImplementationRunInput): Promise<unknown>;
  findFailurePhase(brief: string): number | null;
  metadataStore: Pick<CardMetadataStore, "recordFeatureWorkflowRun">;
  notifyChanged(projectId: string, eventType: string, externalId: string): void;
  readGit(rootPath: string, args: string[]): string;
  receiptPolicy: Pick<WorkflowTransitionReceiptPolicy, "createContext" | "validate">;
  resolveDeliveryPolicy(): string;
  resolveImplementation(input: FeatureWorkflowActionInput): Promise<{ feature: WorkItemCard; project: StoredProject }>;
  resolvePreviousFailure(feature: WorkItemCard): string | null;
  scanProject(project: StoredProject): Promise<WorkItemCard[]>;
  seedManualTestSkips(input: {
    cardKey: string;
    feature: WorkItemCard;
    project: StoredProject;
    runId: string;
  }): Promise<number>;
  toProjectSummary(project: StoredProject): ProjectSummary;
  validateRefinement(folderPath: string, projectId: string, featureId: string): { valid: boolean; errors: Array<{ code: string; message: string; path: string }> };
}

/** Validates and durably starts the Start Implementation lifecycle. */
export class StartImplementationApplication {
  constructor(private readonly dependencies: StartImplementationDependencies) {}

  async start(input: FeatureWorkflowActionInput): Promise<FeatureWorkflowActionResponse> {
    const { feature, project } = await this.dependencies.resolveImplementation(input);
    this.assertBaseEligibility(feature);
    const refinement = this.dependencies.validateRefinement(
      feature.folderPath, project.id, feature.externalId.toLowerCase(),
    );
    if (!refinement.valid) {
      const details = refinement.errors.map((error) => `[${error.code}] ${error.path}: ${error.message}`).join("; ");
      throw new Error(`Refinement artifacts failed validation before Start Feature: ${details}`);
    }

    const readiness = this.dependencies.evaluateReadiness(feature);
    this.assertReadiness(feature, readiness);
    const activeCommand = feature.featureWorkflow?.activeRun?.command ?? null;
    const conflict = this.dependencies.classifyConflicts(false, activeCommand);
    const prerequisites = this.dependencies.classifyPrerequisites(
      readiness.ready,
      readiness.reasons.filter((reason) => reason.blocking).map(({ code, message }) => ({ code, message })),
      conflict.hasConflict,
      activeCommand,
    );
    if (!prerequisites.readyToProceed) {
      throw new Error(this.formatBlocked(feature, prerequisites.blockingReasons));
    }

    const deliveryPolicy = this.dependencies.resolveDeliveryPolicy();
    const autonomous = input.autonomous !== false;
    const runId = `workflow-${this.dependencies.createId()}`;
    const cardKey = this.dependencies.createCardKey(feature.kind, feature.externalId);
    const branchName = this.dependencies.deriveBranchName(feature.externalId, feature.folderName ?? null);
    const { context, packRefs } = this.dependencies.receiptPolicy.createContext(project, feature);
    const receiptError = this.dependencies.receiptPolicy.validate({
      cardKey, command: "start-implementing", context, contextPackRefs: packRefs,
      stage: "start-implementing", nextState: "03_IN_PROGRESS", projectId: project.id, projectRoot: project.rootPath,
    });
    if (receiptError) throw receiptError;

    const previousFailureBrief = this.dependencies.resolvePreviousFailure(feature);
    const forcedRecoveryPhaseNumber = this.dependencies.findFailurePhase(previousFailureBrief ?? "");
    await this.dependencies.seedManualTestSkips({ cardKey, feature, project, runId });
    await this.dependencies.metadataStore.recordFeatureWorkflowRun({
      cardKey, command: "start-implementing", currentNodeId: "create-branch",
      currentStep: `Creating branch ${branchName}`, projectId: project.id, runId, status: "running",
      summary: this.dependencies.appendSnapshot(`Starting implementation for ${feature.externalId}.`, context, packRefs),
    });

    this.dependencies.clearCancellation(runId);
    void this.dependencies.execute({
      autonomous,
      baseBranch: this.dependencies.readGit(project.rootPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || "master",
      branchName, cardKey, deliveryPolicy, feature,
      forcedRecoveryPhaseNumber, previousFailureBrief, project, repoRoot: project.rootPath, runId,
      startCommit: this.dependencies.readGit(project.rootPath, ["rev-parse", "HEAD"]).trim() || "unknown",
      transitionOnly: !autonomous,
    });
    this.dependencies.notifyChanged(project.id, "workflow.started", feature.externalId);
    return {
      filesChanged: [], filesCreated: [], items: await this.dependencies.scanProject(project),
      project: this.dependencies.toProjectSummary(project), summary: `Implementation started for ${feature.externalId}.`,
    };
  }

  private assertBaseEligibility(feature: WorkItemCard): void {
    if (feature.featureWorkflow?.activeRun?.status === "running") {
      throw new Error(`${feature.externalId} already has a running ${feature.featureWorkflow.activeRun.command} workflow.`);
    }
    if (feature.stateFolder !== "02_READY_TO_DEVELOP") throw new Error("Only READY FEATs can start implementation.");
    if (!feature.featureWorkflow?.hasRefinementArtifacts) throw new Error("Refine this FEAT before starting implementation.");
  }

  private assertReadiness(feature: WorkItemCard, result: ReadinessResult): void {
    if (!result.ready) throw new Error(this.formatBlocked(feature, result.reasons.filter((reason) => reason.blocking)));
  }

  private formatBlocked(feature: WorkItemCard, reasons: ReadonlyArray<{ code: string; message: string }>): string {
    return `${feature.externalId} is not ready to start implementation:\n${reasons.map((reason) => `  - [${reason.code}] ${reason.message}`).join("\n")}`;
  }
}
