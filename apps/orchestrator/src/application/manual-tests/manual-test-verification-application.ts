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
  readonly #dependencies: ManualTestVerificationDependencies;
  readonly #operations: NonNullable<ManualTestVerificationDependencies["operations"]>;

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
    try {
      const target = await this.#findTarget(input);
      if ("error" in target) return { success: false, message: target.error, errors: [target.error] };
      const { feature, items, project } = target;
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
    }
  }

  async review(input: ManualTestVerificationActionInput): Promise<ManualTestVerificationReviewResponse> {
    try {
      if (!input.packId) return { success: false, message: "packId is required.", errors: ["packId is required."] };
      const target = await this.#findTarget(input);
      if ("error" in target) return { success: false, message: target.error, errors: [target.error] };
      const result = await this.#operations.recordPackReview({
        context: this.#context(target.project, target.feature),
        packId: input.packId,
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
      const testResult = result === "pass"
        ? await this.#operations.recordAllPasses({ context, packId: input.packId, reviewId: input.reviewId })
        : await this.#operations.recordTestResult({
            context, packId: input.packId, reviewId: input.reviewId, testId: input.testId!, result,
            actualResult: input.actualResult ?? null, notes: input.notes ?? null,
          });
      if (testResult.success && result === "pass") {
        await this.#dependencies.metadataStore.recordFeatureHumanReview({
          cardKey: this.#dependencies.createCardKey(target.feature.kind, target.feature.externalId),
          check: "manual-tests",
          projectId: target.project.id,
        });
      }
      this.#dependencies.notifyChanged(target.project.id, "manual-test.recorded", target.feature.externalId);
      const shouldStartCompletion = testResult.success && result === "pass" &&
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
