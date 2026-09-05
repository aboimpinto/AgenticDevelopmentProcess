import type { ProjectSummary } from "../projects/contracts.js";
import type { WorkItemCard } from "../work-items/contracts.js";
import type { EpicDeliveryState } from "../work-items/identity-contracts.js";

export type SubmitEpicPriority = "Critical" | "High" | "Medium" | "Low";
export type SubmitEpicMode = "structured" | "idea";

export interface SubmitEpicInput {
  description?: string;
  externalReference?: string;
  ideaText?: string;
  mode?: SubmitEpicMode;
  owner?: string;
  priority?: SubmitEpicPriority;
  problemStatement?: string;
  projectId: string;
  successCriteria?: string;
  targetCompletion?: string;
  title?: string;
}

export interface EpicSyncSummary {
  derivedState: EpicDeliveryState;
  progressPercent: number;
  progressCounts: {
    total: number;
    completed: number;
    inProgress: number;
    ready: number;
    submitted: number;
    cancelled: number;
    missing: number;
  };
  sectionUpdates: {
    metadataState: boolean;
    metadataProgress: boolean;
    featureTableStatuses: boolean;
    epicProgressSummary: boolean;
    progressTrackingStatuses: boolean;
    mermaidClasses: boolean;
  };
  skippedSections: string[];
  warnings: string[];
  blockers: string[];
  documentWritten: boolean;
}

export interface CreateMissingFeaturesInput {
  cardId: string;
  projectId: string;
  /** Required for confirm-and-apply; validates the plan still matches current state. */
  planHash?: string;
  /** Confirm-and-apply payload approved by the user; avoids rerunning nondeterministic preview discovery. */
  previewPlan?: BatchPreviewPlan;
  /** Required for confirm-and-apply; validates the EPIC source hasn't changed since preview. */
  sourceDocumentHash?: string;
}

export interface EpicUpdateSection {
  section: string; // "feature-table" | "feature-details" | "progress-tracking" | "mermaid-diagram"
  updated: boolean;
  details: string[];
}

export interface CreateMissingFeaturesResponse {
  createdFeatureIds: string[];
  discoveredFeatureCount: number;
  items: WorkItemCard[];
  project: ProjectSummary;
  skippedFeatureIds: string[];
  existingFeatureIds?: string[];
  recoveredFeatureIds?: string[];
  blockedFeatureIds?: string[];
  epicUpdates?: EpicUpdateSection[];
  warnings?: string[];
}

export interface PreviewFeatCandidate {
  title: string;
  summary: string;
  plannedFeatureId: string;
  plannedFolderName: string;
  plannedDocumentPath: string;
  parentEpic: string;
  dependencyIds: string[];
  priority: string | null;
  sourceOrder: number;
  backlinkText: string;
  fromExplicitLink: boolean;
}

export interface EpicUpdate {
  section: string;
  beforeDescription: string | null;
  afterDescription: string | null;
}

export type PreviewWarningType =
  | "epic-order-gap"
  | "missing-dependency"
  | "duplicate-feat"
  | "tbd-row"
  | "unresolved-sequence";

export interface PreviewWarning {
  type: PreviewWarningType;
  message: string;
  affectedFeatureIds: string[];
}

export interface BatchPreviewPlan {
  epicId: string;
  epicDocumentHash: string;
  previewGeneratedAt: string;
  planHash: string;
  explicitCandidates: PreviewFeatCandidate[];
  discoveredCandidates: PreviewFeatCandidate[];
  epicUpdates: EpicUpdate[];
  warnings: PreviewWarning[];
  applyAllowed: boolean;
}

export interface PreviewMissingFeaturesInput {
  cardId: string;
  projectId: string;
}

export interface PreviewMissingFeaturesResponse {
  plan: BatchPreviewPlan;
  items: WorkItemCard[];
  project: ProjectSummary;
}

export interface SubmitEpicResponse {
  epic: WorkItemCard;
  filesCreated: string[];
  items: WorkItemCard[];
  project: ProjectSummary;
  summary: string;
}

export interface EpicRefinementSummary {
  changedSections: string[];
  createdAt: string;
  id: string;
  request: string;
  summary: string;
}

export interface SubmitEpicRefinementInput {
  cardId: string;
  projectId: string;
  request: string;
}

export interface SubmitEpicRefinementResponse {
  epic: WorkItemCard;
  filesChanged: string[];
  items: WorkItemCard[];
  project: ProjectSummary;
  refinement: EpicRefinementSummary;
  summary: string;
}
