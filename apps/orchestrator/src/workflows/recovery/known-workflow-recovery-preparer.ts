import {
  isCodeReviewAgentFailure,
  isCodeReviewBlockedFailure,
  isIncompleteFixerResponseFailure,
  isMissingPiCliFailure,
  isUnsafeCargoExecutionFailure,
} from "./implementation-failure-classifier.js";

export interface KnownWorkflowRecoveryPlan {
  readonly canRetry: boolean;
  readonly skipRecoveryAgent?: boolean;
  readonly summary: string;
}

export interface KnownWorkflowRecoveryDependencies {
  readonly ensureCargoShimDirectory: () => string | null;
  readonly findCodeReviewContext: (errorMessage: string) => {
    readonly phaseNumber: number;
    readonly reportPath: string;
  } | null;
  readonly resolvePi: () => {
    readonly diagnostics: string[];
    readonly invocation: {
      readonly displayCommand: string;
      readonly source: string;
    } | null;
  };
  readonly formatMissingPi: (diagnostics: string[]) => string;
}

export function prepareKnownWorkflowRecovery(
  errorMessage: string,
  dependencies: KnownWorkflowRecoveryDependencies,
): KnownWorkflowRecoveryPlan {
  const normalized = errorMessage.toLowerCase();

  if (isIncompleteFixerResponseFailure(errorMessage)) {
    const context = dependencies.findCodeReviewContext(errorMessage);
    return {
      canRetry: true,
      skipRecoveryAgent: true,
      summary: context
        ? `Prepared Fixer Response completion for Phase ${context.phaseNumber}. Append complete responses for every required finding to ${context.reportPath}; do not change reviewer-owned finding text, request another review, or reopen unrelated work.`
        : "Prepared Fixer Response completion. Append the missing required finding responses to the latest review report before any review rerun.",
    };
  }

  if (isCodeReviewAgentFailure(errorMessage)) {
    return {
      canRetry: true,
      skipRecoveryAgent: true,
      summary: [
        "Prepared code-review worker retry context.",
        "The phase implementation already reached the code-review gate; rerun the code-review worker instead of launching another implementation worker.",
        "The next code-review worker must use simple absolute-path inspection commands, avoid fragile shell headings such as printf, treat optional no-match searches as non-fatal, retry corrected path/shell mistakes, and always return one exact Review Result line.",
      ].join(" "),
    };
  }

  if (isUnsafeCargoExecutionFailure(normalized)) {
    return {
      canRetry: true,
      skipRecoveryAgent: true,
      summary: [
        "Prepared command-safety retry context.",
        "No recovery edits are needed; the next implementation worker must reread Project LessonsLearned Active Rules and follow the project command sequencing/tool safety rule that was violated.",
        "Keep Cargo in the foreground. Sequential Cargo invocations may share one shell tool call, but never background Cargo or emit sibling Cargo tool calls that Pi may execute concurrently.",
        "Wait for the complete foreground result before starting another Cargo tool call, and inspect active cargo/rustc processes before retrying a timeout.",
      ].join(" "),
    };
  }

  if (isCodeReviewBlockedFailure(errorMessage)) {
    const context = dependencies.findCodeReviewContext(errorMessage);
    return {
      canRetry: true,
      summary: context
        ? `Prepared code-review retry context for Phase ${context.phaseNumber}. The Resolve Findings step must resolve every finding from ${context.reportPath}: fix BLOCKER/REQUIRED findings or escalate blocked_needs_user, evaluate notes with an explicit decision, and rerun code review before advancing.`
        : "Prepared code-review retry context. The Resolve Findings step must resolve the review-finding decision queue, including MemoryBank/documentation/git-state findings when present, and rerun review before advancing.",
    };
  }

  if (isMissingPiCliFailure(normalized)) {
    const resolution = dependencies.resolvePi();
    if (resolution.invocation) {
      return {
        canRetry: true,
        skipRecoveryAgent: true,
        summary: [
          `Resolved Pi CLI for retry: ${resolution.invocation.displayCommand} (${resolution.invocation.source}).`,
          ...resolution.diagnostics.map((diagnostic) => `Pi resolver: ${diagnostic}`),
        ].join(" "),
      };
    }

    return {
      canRetry: false,
      skipRecoveryAgent: true,
      summary: dependencies.formatMissingPi(resolution.diagnostics),
    };
  }

  if (normalized.includes("cargo: command not found") || normalized.includes("cargo.exe")) {
    const cargoShimDir = dependencies.ensureCargoShimDirectory();
    return cargoShimDir
      ? {
          canRetry: true,
          summary: `Prepared a Cargo shim directory for retry: ${cargoShimDir}. Future Pi workers receive this directory on PATH.`,
        }
      : {
          canRetry: false,
          summary: "Cargo was unavailable, and Hepha could not find an existing Cargo executable to expose through a shell shim. The recovery agent may attempt a safe user-level Rust toolchain install before deciding whether retry is possible.",
        };
  }

  return { canRetry: false, summary: "No deterministic host-side recovery was available for this failure." };
}
