import type { CardMetadataStore } from "@hepha/db";
import type {
  ManualTestPackDashboardState,
  ManualTestVerificationActionInput,
  ManualTestVerificationGenerateResponse,
  ManualTestVerificationResultResponse,
  ManualTestVerificationReviewResponse,
  ManualTestVerificationStatusResponse,
  WorkItemCard,
} from "@hepha/shared";
import { resolve } from "node:path";
import type { StoredProject } from "../../projects/stored-project.js";
import type {
  ManualTestAdapterContext,
  SourceDiscoveryOptions,
} from "../../manual-test-verification-adapter.js";
import {
  generatePack,
  queryPackStatus,
  recordAllManualTestPasses,
  recordPackReview,
  recordTestResult,
} from "../../manual-test-verification-adapter.js";

export interface ManualTestVerificationDependencies {
  readonly isRecoveryRunning?: (projectId: string, cardId: string) => boolean;
  readonly runAuthoringPrompt?: (prompt: string) => Promise<string>;
  readonly allPhasesResolved: (feature: WorkItemCard) => boolean;
  readonly createCardKey: (kind: WorkItemCard["kind"], externalId: string) => string;
  readonly findProject: (projectId: string) => StoredProject | null | undefined;
  readonly maybeStartCompletion: (project: StoredProject, feature: WorkItemCard) => Promise<boolean>;
  readonly metadataStore: CardMetadataStore;
  readonly notifyChanged: (projectId: string, event: string, externalId: string) => void;
  readonly operations?: {
    generatePack: typeof generatePack;
    queryPackStatus: typeof queryPackStatus;
    recordAllPasses: typeof recordAllManualTestPasses;
    recordPackReview: typeof recordPackReview;
    recordTestResult: typeof recordTestResult;
  };
  readonly scanProject: (project: StoredProject) => Promise<WorkItemCard[]>;
}

const missingStatus = (message: string): ManualTestVerificationStatusResponse => ({
  success: false,
  status: {
    state: "missing", currentPackId: null, currentVersion: null, hasMarkdown: false, hasPdf: false,
    isStale: false, isReviewed: false, currentReviewId: null, failedCount: 0, passedCount: 0,
    hasResults: false, message,
    applicability: "incomplete", manualTestCount: 0, invalidManualTestCount: 0, isReady: false,
  },
  summary: message,
});

export class ManualTestVerificationApplication {
  readonly #generating = new Set<string>();
  readonly #dependencies: ManualTestVerificationDependencies;
  readonly #operations: NonNullable<ManualTestVerificationDependencies["operations"]>;
  isGenerating(projectId: string, cardId: string) { return this.#generating.has(JSON.stringify([projectId, cardId])); }

  constructor(dependencies: ManualTestVerificationDependencies) {
    this.#dependencies = dependencies;
    this.#operations = dependencies.operations ?? {
      generatePack,
      queryPackStatus,
      recordAllPasses: recordAllManualTestPasses,
      recordPackReview,
      recordTestResult,
    };
  }

  async generate(input: ManualTestVerificationActionInput): Promise<ManualTestVerificationGenerateResponse> {
    const key = JSON.stringify([input.projectId, input.cardId]);
    if (this.#generating.has(key) || this.#dependencies.isRecoveryRunning?.(input.projectId, input.cardId)) return { success: false, message: "Manual-test generation or readiness recovery is already running for this feature.", errors: ["Generation or recovery already running."] };
    this.#generating.add(key);
    try {
      if (input.guidance !== undefined && (typeof input.guidance !== "string" || input.guidance.length > 10_000)) throw new Error("Guidance must be text of at most 10000 characters.");
      const target = await this.#findTarget(input);
      if ("error" in target) return { success: false, message: target.error, errors: [target.error] };
      const { feature, items, project } = target;
      if (feature.featureWorkflow?.activeRun) throw new Error("Wait for the active feature workflow before regenerating manual tests.");
      if (!this.#dependencies.allPhasesResolved(feature)) {
        return {
          success: false,
          message: "All implementation phases must be resolved before generating a verification pack.",
          errors: ["Not all implementation phases are resolved."],
        };
      }
      const result = await this.#operations.generatePack({
        context: this.#context(project, feature),
        sourceOptions: this.#sourceOptions(feature, items),
        replacePackId: input.packId,
        guidance: input.guidance,
        runPrompt: this.#dependencies.runAuthoringPrompt,
        assessCoverage: true,
      });
      if (result.success && result.applicability === "not_applicable") {
        await this.#dependencies.metadataStore.recordFeatureHumanReview({
          cardKey: this.#dependencies.createCardKey(feature.kind, feature.externalId),
          check: "manual-tests",
          projectId: project.id,
        });
      }
      this.#dependencies.notifyChanged(project.id, "manual-test-pack.generated", feature.externalId);
      return {
        success: result.success,
        packId: result.packId ?? undefined,
        version: result.version ?? undefined,
        state: result.state === "current" ? "current" : result.state === "render_failed" ? "render_failed" : "missing",
        message: result.message,
        errors: result.errors,
      };
    } catch (error) {
      return this.#failure("Pack generation failed", error);
    } finally {
      this.#generating.delete(key);
    }
  }

  async review(input: ManualTestVerificationActionInput): Promise<ManualTestVerificationReviewResponse> {
    try {
      if (!input.packId) return { success: false, message: "packId is required.", errors: ["packId is required."] };
      const target = await this.#findTarget(input);
      if ("error" in target) return { success: false, message: target.error, errors: [target.error] };
      await this.#assertReady(target.project, target.feature, target.items, input.packId, input.testId);
      const result = await this.#operations.recordPackReview({
        context: this.#context(target.project, target.feature),
        packId: input.packId,
        ...(input.testId ? { testId: input.testId } : {}),
      });
      this.#dependencies.notifyChanged(target.project.id, "manual-test-pack.reviewed", target.feature.externalId);
      return {
        success: result.success,
        reviewId: result.reviewId ?? undefined,
        packId: input.packId,
        message: result.message,
        errors: result.errors,
      };
    } catch (error) {
      return this.#failure("Review failed", error);
    }
  }

  async recordResult(
    input: ManualTestVerificationActionInput,
    result: "pass" | "fail",
  ): Promise<ManualTestVerificationResultResponse> {
    try {
      if (!input.packId || !input.reviewId || (result === "fail" && !input.testId)) {
        return {
          success: false,
          message: result === "pass" ? "packId and reviewId are required." : "packId, reviewId, and testId are required.",
          errors: ["Missing required fields."],
        };
      }
      const target = await this.#findTarget(input);
      if ("error" in target) return { success: false, message: target.error, errors: [target.error] };
      const context = this.#context(target.project, target.feature);
      await this.#assertReady(target.project, target.feature, target.items, input.packId, input.testId);
      const testResult = result === "pass" && !input.testId
        ? await this.#operations.recordAllPasses({ context, packId: input.packId, reviewId: input.reviewId })
        : await this.#operations.recordTestResult({
            context, packId: input.packId, reviewId: input.reviewId, testId: input.testId!, result,
            actualResult: input.actualResult ?? null, notes: input.notes ?? null,
          });
      const afterStatus = testResult.success && result === "pass"
        ? await this.#operations.queryPackStatus({ context, currentSourceOptions: this.#sourceOptions(target.feature, target.items) }) : null;
      const manualVerificationComplete = testResult.success && result === "pass" && !!(
        afterStatus?.isReady && !afterStatus.isStale && afterStatus.currentPackId === input.packId && afterStatus.isReviewed && afterStatus.failedCount === 0 &&
        (!input.testId || (afterStatus.manualCases?.length && afterStatus.manualCases.every((test) => test.isReviewed && test.result === "pass")))
      );
      if (manualVerificationComplete) {
        await this.#dependencies.metadataStore.recordFeatureHumanReview({
          cardKey: this.#dependencies.createCardKey(target.feature.kind, target.feature.externalId),
          check: "manual-tests",
          projectId: target.project.id,
        });
      }
      this.#dependencies.notifyChanged(target.project.id, "manual-test.recorded", target.feature.externalId);
      const shouldStartCompletion = manualVerificationComplete &&
        target.feature.stateFolder === "03_IN_PROGRESS";
      const currentFeature = shouldStartCompletion
        ? (await this.#dependencies.scanProject(target.project)).find(
            (candidate) => candidate.id === target.feature.id && candidate.kind === "feature",
          ) ?? null
        : null;
      const completionStarted = currentFeature
        ? await this.#dependencies.maybeStartCompletion(target.project, currentFeature)
        : false;
      return {
        success: testResult.success,
        resultId: testResult.resultId ?? undefined,
        findingId: testResult.findingId,
        message: completionStarted ? `${testResult.message} Complete Feature finalization started.` : testResult.message,
        errors: testResult.errors,
      };
    } catch (error) {
      return this.#failure("Recording test result failed", error);
    }
  }

  async status(input: { cardId: string; projectId: string }): Promise<ManualTestVerificationStatusResponse> {
    try {
      const target = await this.#findTarget(input);
      if ("error" in target) return missingStatus(target.error);
      const packStatus = await this.#operations.queryPackStatus({
        context: this.#context(target.project, target.feature),
        currentSourceOptions: this.#sourceOptions(target.feature, target.items),
      });
      return {
        success: true,
        status: {
          state: mapPackState(packStatus.state), currentPackId: packStatus.currentPackId,
          currentVersion: packStatus.currentVersion, hasMarkdown: packStatus.hasMarkdown,
          hasPdf: packStatus.hasPdf, isStale: packStatus.isStale, isReviewed: packStatus.isReviewed,
          currentReviewId: packStatus.currentReviewId, failedCount: packStatus.failedCount,
          passedCount: packStatus.passedCount, hasResults: packStatus.hasResults, message: packStatus.message,
          applicability: packStatus.applicability, manualTestCount: packStatus.manualTestCount,
          invalidManualTestCount: packStatus.invalidManualTestCount, isReady: packStatus.isReady,
          coverageIssues: packStatus.coverageIssues, manualCases: packStatus.manualCases,
          authoringProgress: packStatus.authoringProgress?.state === "running" && !this.#generating.has(JSON.stringify([input.projectId, input.cardId]))
            ? { ...packStatus.authoringProgress, state: "paused", message: "Authoring was interrupted. Retry with the same guidance to resume saved batches." }
            : packStatus.authoringProgress,
        },
        summary: packStatus.message,
      };
    } catch (error) {
      return missingStatus(`Status query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async #findTarget(input: { cardId: string; projectId: string }): Promise<
    | { error: string }
    | { feature: WorkItemCard; items: WorkItemCard[]; project: StoredProject }
  > {
    const project = this.#dependencies.findProject(input.projectId);
    if (!project) return { error: "Project not found." };
    const items = await this.#dependencies.scanProject(project);
    const feature = items.find((candidate) => candidate.id === input.cardId && candidate.kind === "feature");
    return feature ? { feature, items, project } : { error: "FEAT not found." };
  }

  async #assertReady(project: StoredProject, feature: WorkItemCard, items: WorkItemCard[], packId: string, testId?: string) {
    if (this.#dependencies.isRecoveryRunning?.(project.id, feature.id)) throw new Error("Wait for readiness recovery to finish before changing manual verification.");
    if (this.#generating.has(JSON.stringify([project.id, feature.id])) || feature.featureWorkflow?.activeRun) throw new Error("Wait for the active workflow or pack generation to finish.");
    if (!this.#dependencies.allPhasesResolved(feature)) throw new Error("Implementation phases must be resolved before manual verification.");
    const status = await this.#operations.queryPackStatus({ context: this.#context(project, feature), currentSourceOptions: this.#sourceOptions(feature, items) });
    if ((testId ? !status.manualCases?.some((test) => test.id === testId) : !status.isReady && !status.manualCases?.length) || status.isStale || status.currentPackId !== packId || status.state !== "current") {
      throw new Error("The current manual test pack is incomplete or stale. Revise and regenerate it before review or result recording.");
    }
  }

  #context(project: StoredProject, feature: WorkItemCard): ManualTestAdapterContext {
    return {
      projectRoot: project.rootPath, projectId: project.id,
      cardKey: this.#dependencies.createCardKey("feature", feature.externalId),
      featExternalId: feature.externalId, featTitle: feature.title,
      epicExternalId: feature.linkedEpicIds[0] ?? null, featFolderPath: feature.folderPath,
      store: this.#dependencies.metadataStore,
    };
  }

  #sourceOptions(feature: WorkItemCard, items: WorkItemCard[]): SourceDiscoveryOptions {
    const epicId = feature.linkedEpicIds[0];
    const epicDocumentPath = epicId
      ? items.find((candidate) => candidate.externalId === epicId && candidate.kind === "epic")?.documentPath ?? null
      : null;
    return {
      featDescriptionPath: feature.documentPath ?? resolve(feature.folderPath, "FeatureDescription.md"),
      epicDescriptionPath: epicDocumentPath,
      epicAcceptanceTestsPath: null,
      gherkinPaths: [],
    };
  }

  #failure(prefix: string, error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    return { success: false as const, message: `${prefix}: ${detail}`, errors: [detail] };
  }
}

export function mapPackState(state: import("../../manual-test-verification-types.js").ManualTestPackState): ManualTestPackDashboardState {
  switch (state) {
    case "current": return "current";
    case "stale": return "stale";
    case "render_failed": return "render_failed";
    case "generating": return "generating";
    case "missing":
    default: return "missing";
  }
}
