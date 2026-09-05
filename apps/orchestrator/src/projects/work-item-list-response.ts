import type {
  WorkItemCard,
  WorkItemListResponse,
  WorkItemScanStatus,
  WorkItemSourceIssue,
} from "@hepha/shared";
import { toProjectSummary } from "./project-summary.js";
import type { StoredProject } from "./stored-project.js";

export interface ProjectWorkItemScanResult {
  items: WorkItemCard[];
  scanStatus: WorkItemScanStatus;
  sourceIssues: WorkItemSourceIssue[];
}

export function toWorkItemListResponse(
  project: StoredProject,
  scanResult: ProjectWorkItemScanResult,
  scannedAt = new Date().toISOString(),
): WorkItemListResponse {
  return {
    items: scanResult.items,
    project: toProjectSummary(project),
    scanStatus: scanResult.scanStatus,
    scannedAt,
    sourceIssues: scanResult.sourceIssues,
  };
}
