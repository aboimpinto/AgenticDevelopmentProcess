import type { FeatureWorkflowCommand, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export type ImplementationWorkflowCommand = Extract<
  FeatureWorkflowCommand,
  "start-implementing" | "continue-implementing"
>;

export interface ImplementationWorkflowInput {
  /** Explicit launch authority supplied by the orchestrated entry point; never inferred from command. */
  agentAction: "start-feature" | "continue-implementing";
  autonomous: boolean;
  branchMessage: string;
  branchName: string;
  cardKey: string;
  command: ImplementationWorkflowCommand;
  feature: WorkItemCard;
  forcedRecoveryPhaseNumber?: number | null;
  previousFailureBrief: string | null;
  project: StoredProject;
  recoveryAttempt: number;
  runId: string;
}
