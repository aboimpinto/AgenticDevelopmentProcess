import type { ProjectSummary } from "../projects/contracts.js";
import type { WorkItemCard } from "./contracts.js";
import type { CardKind, MemoryBankStateFolder } from "./identity-contracts.js";

export type WorkItemDeepDiveStatus = "not_recorded" | "current" | "stale" | "metadata_unavailable";

export interface WorkItemValidationSummary {
  blocksFeatureExtraction: boolean;
  changedSinceHephaDeepDive: boolean;
  deepDiveMessage: string;
  deepDiveStatus: WorkItemDeepDiveStatus;
  lastHephaDeepDiveAt: string | null;
  needsValidationCount: number;
}

export interface WorkItemRelation {
  externalId: string;
  id: string;
  kind: CardKind;
  stateFolder: MemoryBankStateFolder;
  stateLabel: string;
  title: string;
}

export interface PhaseSummary {
  /** Stable semantic identity from PhaseExecutionContract.json; phase number/title remain display-only. */
  executionContractId?: string | null;
  defaultImplementationModel: string | null;
  documentPath: string;
  documentRelativePath: string;
  estimatedAiTime: string | null;
  estimatedHumanTime: string | null;
  fileName: string;
  number: number | null;
  predictedModel: string | null;
  predictedModelSource: "feature_default" | "phase_override" | "unavailable_phase_override" | "workflow_policy";
  recommendedAgent: string | null;
  recommendedModel: string | null;
  status: string;
  title: string;
  updatedAt: string;
}

export type WorkItemSourceIssueReason =
  | "missing-document"
  | "missing-required-fields"
  | "empty-document"
  | "unreadable-document"
  | "parse-error";

export interface WorkItemSourceIssue {
  id: string;
  kind: "invalid-source";
  sourceType: CardKind;
  severity: "invalid" | "warning";
  folderName: string;
  folderPath: string;
  sourcePath: string | null;
  sourceRelativePath: string | null;
  reason: WorkItemSourceIssueReason;
  message: string;
}

export interface WorkItemScanStatus {
  epicDocumentCount: number;
  epicFolderExists: boolean;
  epicInvalidSourceCount: number;
  epicScanFailed: boolean;
  epicValidItemCount: number;
  message: string | null;
}

export interface WorkItemListResponse {
  items: WorkItemCard[];
  project: ProjectSummary;
  scannedAt: string;
  scanStatus: WorkItemScanStatus;
  sourceIssues: WorkItemSourceIssue[];
}
