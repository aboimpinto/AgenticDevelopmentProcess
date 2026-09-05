import type { ProjectSummary } from "../projects/contracts.js";
import type { WorkItemCard } from "../work-items/contracts.js";

export interface SubmitFeatureInput {
  projectId: string;
  title: string;
  summary: string;
  acceptanceCriteria?: string[];
  parentEpicId?: string;
  parentEpicTitle?: string;
  priority?: string;
  externalReference?: string;
  owner?: string;
}

export interface SubmitFeatureResponse {
  feature: WorkItemCard;
  filesCreated: string[];
  items: WorkItemCard[];
  project: ProjectSummary;
  summary: string;
}

export interface LinkFeatureToEpicInput {
  /** Operation type: link, relink, or unlink. */
  operation: "link" | "relink" | "unlink";
  /** Target EPIC card ID for link/relink operations. */
  targetEpicCardId?: string;
}

export interface EpicUpdateSummary {
  epicId: string;
  epicTitle: string;
  sectionsUpdated: string[];
  warnings: string[];
}

export interface ScannerVerificationResult {
  linkedEpicIds: string[];
  linkedFeatureIds: string[];
  matched: boolean;
}

export interface LinkFeatureToEpicResponse {
  /** Affected FEAT card IDs. */
  affectedFeatIds: string[];
  /** Affected EPIC card IDs. */
  affectedEpicIds: string[];
  /** Files created or modified (relative to project root). */
  filesChanged: string[];
  /** Old parent EPIC IDs (for relink/unlink). */
  oldParentEpicIds: string[];
  /** New parent EPIC IDs (for link/relink). */
  newParentEpicIds: string[];
  /** EPIC update summaries keyed by EPIC card ID. */
  epicUpdates: Record<string, EpicUpdateSummary>;
  /** Scanner verification result. */
  scannerVerification: ScannerVerificationResult;
  /** Warning messages. */
  warnings: string[];
  /** Blocker messages (operation not applied). */
  blockers: string[];
  /** User-readable summary. */
  summary: string;
}
