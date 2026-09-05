import type { DeepDiveSession } from "../deep-dive/contracts.js";
import type { ProjectSummary } from "../projects/contracts.js";
import type { WorkItemCard } from "../work-items/contracts.js";

export interface FeatureWorkflowActionInput {
  autonomous?: boolean;
  cardId: string;
  projectId: string;
}

export type FeatureHumanReviewCheck = "user-code-review" | "manual-tests";

export interface FeatureHumanReviewInput {
  cardId: string;
  check: FeatureHumanReviewCheck;
  projectId: string;
}

export interface SubmitFeatureFindingInput {
  cardId: string;
  content: string;
  projectId: string;
}

export interface AddFeatureFindingDetailInput {
  cardId: string;
  content: string;
  findingId: string;
  projectId: string;
}

export interface ResolveFeatureFindingInput {
  cardId: string;
  findingId: string;
  projectId: string;
}

export interface FeatureWorkflowActionResponse {
  /** Present only when Continue Implementation started a required Deep-Dive recovery. */
  deepDiveRecoverySession?: DeepDiveSession;
  filesCreated: string[];
  filesChanged: string[];
  items: WorkItemCard[];
  project: ProjectSummary;
  summary: string;
}

export interface FeatureWorkflowConsoleFile {
  content: string;
  isPrimary?: boolean;
  kind?: "stream" | "session" | "prompt" | "other";
  name: string;
  path: string;
  truncated: boolean;
  updatedAt: string;
}

export interface FeatureWorkflowConsoleResponse {
  files: FeatureWorkflowConsoleFile[];
  refreshedAt: string;
  runId: string;
}

export interface WorkflowConsoleCleanupInput {
  keepRunId?: string | null;
}

export interface WorkflowConsoleCleanupResponse {
  deletedFiles: string[];
  keepRunId: string | null;
  keptFiles: string[];
  refreshedAt: string;
}
