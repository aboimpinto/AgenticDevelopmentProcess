import type { CardMetadataStore } from "@hepha/db";

export interface RecordStartTransitionStateInput {
  baseBranch: string;
  cardKey: string;
  deliveryPolicy: string;
  projectId: string;
  repoRoot: string;
  runId: string;
  startCommit: string;
  startedAt: string;
}

interface StartTransitionStateRecorderDependencies {
  reportError?: (message: string, error: unknown) => void;
  store: Pick<CardMetadataStore, "recordStartTransition">;
}

export class StartTransitionStateRecorder {
  constructor(private readonly dependencies: StartTransitionStateRecorderDependencies) {}

  async record(input: RecordStartTransitionStateInput): Promise<void> {
    try {
      await this.dependencies.store.recordStartTransition({
        baseBranch: input.baseBranch,
        cardKey: input.cardKey,
        completedAt: null,
        deliveryPolicy: input.deliveryPolicy,
        failureReason: null,
        implementationBranch: null,
        projectId: input.projectId,
        repoRoot: input.repoRoot,
        rolledBack: false,
        runId: input.runId,
        startCommit: input.startCommit,
        startedAt: input.startedAt,
        transitionStatus: "prerequisites_ready",
        transitionStep: "persist_metadata",
        worktreePath: null,
      });
    } catch (error) {
      this.dependencies.reportError?.(
        `Start-transition state recording failed for ${input.cardKey}.`,
        error,
      );
    }
  }
}
