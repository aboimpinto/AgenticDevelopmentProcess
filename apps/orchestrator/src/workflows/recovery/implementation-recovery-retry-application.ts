import type { WorkItemCard } from "@hepha/shared";
import type { ImplementationRecoveryOutcome } from "../implementation/continue-implementation-run-application.js";
import type { ImplementationWorkflowInput } from "../implementation/implementation-workflow-input.js";

export interface ImplementationRecoveryRetryInput {
  originalErrorMessage: string;
  outputPrefix: string;
  retryFeature: WorkItemCard;
  retryInput: ImplementationWorkflowInput;
}

/** Executes one autonomous recovery retry and keeps the final nested failure authoritative. */
export class ImplementationRecoveryRetryApplication {
  constructor(private readonly dependencies: {
    runAutonomous(input: ImplementationWorkflowInput): Promise<string>;
  }) {}

  async execute(
    input: ImplementationRecoveryRetryInput,
    attemptNestedRecovery: (input: {
      errorMessage: string;
      feature: WorkItemCard;
      input: ImplementationWorkflowInput;
    }) => Promise<ImplementationRecoveryOutcome>,
  ): Promise<ImplementationRecoveryOutcome> {
    try {
      const retryOutput = await this.dependencies.runAutonomous(input.retryInput);
      return {
        errorMessage: input.originalErrorMessage,
        failureBrief: null,
        output: [input.outputPrefix, retryOutput].join("\n"),
        recovered: true,
      };
    } catch (retryError) {
      const retryErrorMessage = retryError instanceof Error
        ? retryError.message
        : "Unknown workflow recovery retry error.";
      const nestedRecovery = await attemptNestedRecovery({
        errorMessage: retryErrorMessage,
        feature: input.retryFeature,
        input: input.retryInput,
      });
      if (nestedRecovery.recovered) {
        return {
          errorMessage: input.originalErrorMessage,
          failureBrief: null,
          output: [input.outputPrefix, nestedRecovery.output].join("\n"),
          recovered: true,
        };
      }
      // Keep the final failure authoritative instead of accumulating every
      // predecessor into an ever-growing retry transcript.
      return {
        errorMessage: nestedRecovery.errorMessage,
        failureBrief: nestedRecovery.failureBrief,
        output: nestedRecovery.output,
        recovered: false,
      };
    }
  }
}
