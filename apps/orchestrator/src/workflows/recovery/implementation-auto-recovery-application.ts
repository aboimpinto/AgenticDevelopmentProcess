import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import type { ImplementationRecoveryOutcome } from "../implementation/continue-implementation-run-application.js";
import type { ImplementationWorkflowInput } from "../implementation/implementation-workflow-input.js";
import { extractPhaseTaskLedger } from "../phases/phase-task-ledger.js";

export interface PreparedImplementationRecovery {
  canRetry: boolean;
  skipRecoveryAgent?: boolean;
  summary: string;
}

export interface ImplementationAutoRecoveryInput {
  errorMessage: string;
  feature: WorkItemCard;
  input: ImplementationWorkflowInput;
}

/**
 * Check whether a phase is genuinely complete according to its derived state,
 * regardless of what the **Status:** field says. A recovery worker must not be
 * dispatched for a phase whose tasks are all checked and whose code review (if
 * required) is approved — the phase is COMPLETED, and the previous error was a
 * stale-status artifact, not a genuine failure.
 */
export function isRecoveryPhaseDerivedCompleted(
  phase: PhaseSummary | undefined,
): boolean {
  if (!phase?.documentPath) return false;
  try {
    if (!existsSync(phase.documentPath)) return false;
    const content = readFileSync(phase.documentPath, "utf8");
    const tasks = extractPhaseTaskLedger(content, phase.number);
    if (tasks.length === 0 || !tasks.every((t) => t.checked)) return false;
    // Tasks are all checked. Check for approved review.
    const reviewsDir = join(dirname(phase.documentPath), "..", "code-reviews");
    if (!existsSync(reviewsDir)) return true; // No code review needed.
    const reports = readdirSync(reviewsDir).filter((f) => f.endsWith(".md"));
    return reports.some((report) => {
      const reportContent = readFileSync(join(reviewsDir, report), "utf8");
      return /✅\s*APPROVED|\bAPPROVED\b/i.test(reportContent);
    });
  } catch {
    return false;
  }
}

interface RetryRoute {
  outputPrefix: string;
  progressStep: string;
  progressSummary: string;
  recoverySummary: string;
}

/** Selects, executes, and bounds generic implementation recovery. */
export class ImplementationAutoRecoveryApplication {
  constructor(private readonly dependencies: {
    appendAnalysis(brief: string, output: string): string;
    appendHostRecovery(brief: string, summary: string): string;
    createFailureBrief(input: ImplementationAutoRecoveryInput, currentFeature: WorkItemCard): string;
    extractFailurePhase(text: string): number | null;
    findCurrentFeature(input: ImplementationWorkflowInput, fallback: WorkItemCard): Promise<WorkItemCard>;
    isCodeReviewFailure(errorMessage: string): boolean;
    isFatalFailure(errorMessage: string): boolean;
    isProviderPromptRefusalFailure(errorMessage: string): boolean;
    isRecoverableFailure(errorMessage: string): boolean;
    isReviewFindingResolutionFailure(feature: WorkItemCard, errorMessage: string): boolean;
    parseRecoveryResult(output: string): string;
    prepareRecovery(errorMessage: string): PreparedImplementationRecovery;
    recordFeatureProgress(input: ImplementationWorkflowInput, feature: WorkItemCard, step: string, summary: string): Promise<void>;
    recordRecoveryProgress(input: ImplementationWorkflowInput, feature: WorkItemCard, phaseNumber: number | null, model: string, step: string): Promise<void>;
    resolveRecoveryModel(input: ImplementationWorkflowInput): import("@hepha/shared").HandoffPlanV1;
    retry(input: {
      originalErrorMessage: string;
      outputPrefix: string;
      retryFeature: WorkItemCard;
      retryInput: ImplementationWorkflowInput;
    }): Promise<ImplementationRecoveryOutcome>;
    runRecoveryWorker(input: {
      errorMessage: string;
      failureBrief: string;
      feature: WorkItemCard;
      input: ImplementationWorkflowInput;
      model: import("@hepha/shared").HandoffPlanV1;
      preparedRecovery: PreparedImplementationRecovery;
      step: string;
    }): Promise<{ output: string; revertedPaths: string[] }>;
    summarizeOutput(output: string, fallback: string): string;
  }) {}

  async attempt({ errorMessage, feature, input }: ImplementationAutoRecoveryInput): Promise<ImplementationRecoveryOutcome> {
    if (errorMessage.includes("WORKFLOW_AWAITING_USER_DECISION")) return this.unrecovered(errorMessage);
    if (this.dependencies.isFatalFailure(errorMessage)) return this.unrecovered(errorMessage);
    const codeReviewFailure = this.dependencies.isCodeReviewFailure(errorMessage);
    const providerPromptRefusal = this.dependencies.isProviderPromptRefusalFailure(errorMessage);
    if (!input.autonomous
      || (!codeReviewFailure && input.recoveryAttempt >= 1)
      || !this.dependencies.isRecoverableFailure(errorMessage)) {
      return this.unrecovered(errorMessage);
    }

    const currentFeature = await this.dependencies.findCurrentFeature(input, feature);
    const failureBrief = this.dependencies.createFailureBrief({ errorMessage, feature, input }, currentFeature);
    const findingResolutionFailed = this.dependencies.isReviewFindingResolutionFailure(currentFeature, errorMessage);

    if (providerPromptRefusal) {
      return await this.retryDirectly(
        { ...input, command: "continue-implementing" },
        currentFeature,
        failureBrief,
        errorMessage,
        {
          outputPrefix: "Retry provider-refused task in a fresh session",
          progressStep: "Continuing implementation in a fresh worker session",
          progressSummary: "The provider refused the accumulated worker prompt. Continue Implementing is resuming the same durable task once with a fresh Pi session.",
          recoverySummary: "Provider prompt refusal: preserve completed task evidence and resume the same unfinished task through Continue Implementing in one fresh Pi session.",
        },
      );
    }

    const preparedRecovery = this.dependencies.prepareRecovery(errorMessage);

    if (findingResolutionFailed && /\bexited with code 143\b/i.test(errorMessage)) {
      return this.unrecovered(`${errorMessage}\n\nFixer response did not complete; no code-review rerun was started. Continue Implementation may retry the same finding resolution.`);
    }
    if (findingResolutionFailed) {
      return await this.retryDirectly(input, currentFeature, failureBrief, errorMessage, {
        outputPrefix: "Retry incomplete code-review finding resolution",
        progressStep: "Retrying incomplete code-review finding resolution",
        progressSummary: "The fixer did not complete; retrying the same review-finding resolution before any review rerun.",
        recoverySummary: "Fixer response was incomplete; retry the same finding resolution. Do not run code review.",
      });
    }
    if (codeReviewFailure) {
      return await this.retryDirectly(input, currentFeature, failureBrief, errorMessage, {
        outputPrefix: "Direct code-review finding resolution",
        progressStep: "Preparing Resolve Findings after code review",
        progressSummary: "Code-review findings are being routed directly to the fixer for a bounded response.",
        recoverySummary: "Code-review findings routed directly to the fixer; no generic recovery-agent retry was run.",
      });
    }
    if (preparedRecovery.skipRecoveryAgent) {
      if (!preparedRecovery.canRetry) {
        return {
          errorMessage: `${errorMessage}\n\n${preparedRecovery.summary}`,
          failureBrief: this.dependencies.appendHostRecovery(failureBrief, preparedRecovery.summary),
          output: "",
          recovered: false,
        };
      }
      await this.dependencies.recordFeatureProgress(
        input, currentFeature, "Retrying implementation after host-side recovery", preparedRecovery.summary,
      );
      return await this.retryWithBrief(
        input,
        currentFeature,
        failureBrief,
        errorMessage,
        `Host-side recovery: ${preparedRecovery.summary}`,
        this.dependencies.appendHostRecovery(failureBrief, preparedRecovery.summary),
      );
    }

    const recoveryStep = "Analyzing failed workflow and preparing autonomous retry";
    const recoveryModel = this.dependencies.resolveRecoveryModel(input);
    const recoveryPhaseNumber = this.dependencies.extractFailurePhase(errorMessage)
      ?? this.dependencies.extractFailurePhase(input.previousFailureBrief ?? "")
      ?? input.forcedRecoveryPhaseNumber
      ?? null;


    await this.dependencies.recordRecoveryProgress(
      input, currentFeature, recoveryPhaseNumber, recoveryModel.resolvedRoute.route.modelId, recoveryStep,
    );
    const worker = await this.dependencies.runRecoveryWorker({
      errorMessage, failureBrief, feature: currentFeature, input,
      model: recoveryModel, preparedRecovery, step: recoveryStep,
    });
    let recoveryOutput = worker.output;
    if (worker.revertedPaths.length > 0) {
      recoveryOutput = [
        recoveryOutput.trimEnd(), "", "## Host Recovery Guard", "",
        `Hepha reverted prohibited recovery-agent mutations to machine-owned workflow state: ${worker.revertedPaths.join(", ")}. Recovery agents may diagnose state but cannot write phase lifecycle fields, quality gates, task ledgers, or FeatureTasks.md.`,
      ].join("\n");
    }
    if (this.dependencies.parseRecoveryResult(recoveryOutput) !== "retry" && !preparedRecovery.canRetry) {
      return {
        errorMessage: `${errorMessage}\n\nRecovery analysis did not approve an autonomous retry.\n${recoveryOutput}`,
        failureBrief: this.dependencies.appendAnalysis(failureBrief, recoveryOutput),
        output: recoveryOutput,
        recovered: false,
      };
    }
    await this.dependencies.recordFeatureProgress(
      input,
      currentFeature,
      "Retrying implementation after recovery analysis",
      this.dependencies.summarizeOutput(recoveryOutput, "Recovery analysis approved an autonomous retry."),
    );
    return await this.retryWithBrief(
      input,
      currentFeature,
      failureBrief,
      errorMessage,
      `Recovery analysis: ${this.dependencies.summarizeOutput(recoveryOutput, "Recovery completed.")}`,
      this.dependencies.appendAnalysis(failureBrief, recoveryOutput),
    );
  }

  private async retryDirectly(
    input: ImplementationWorkflowInput,
    feature: WorkItemCard,
    failureBrief: string,
    errorMessage: string,
    route: RetryRoute,
  ): Promise<ImplementationRecoveryOutcome> {
    await this.dependencies.recordFeatureProgress(input, feature, route.progressStep, route.progressSummary);
    return await this.retryWithBrief(
      input, feature, failureBrief, errorMessage, route.outputPrefix,
      this.dependencies.appendHostRecovery(failureBrief, route.recoverySummary),
    );
  }

  private async retryWithBrief(
    input: ImplementationWorkflowInput,
    feature: WorkItemCard,
    failureBrief: string,
    errorMessage: string,
    outputPrefix: string,
    previousFailureBrief: string,
  ): Promise<ImplementationRecoveryOutcome> {
    const retryFeature = await this.dependencies.findCurrentFeature(input, feature);
    return await this.dependencies.retry({
      originalErrorMessage: errorMessage,
      outputPrefix,
      retryFeature,
      retryInput: {
        ...input,
        feature: retryFeature,
        forcedRecoveryPhaseNumber: this.dependencies.extractFailurePhase(failureBrief) ?? input.forcedRecoveryPhaseNumber,
        previousFailureBrief,
        recoveryAttempt: input.recoveryAttempt + 1,
      },
    });
  }

  private unrecovered(errorMessage: string): ImplementationRecoveryOutcome {
    return { errorMessage, failureBrief: null, output: "", recovered: false };
  }
}
