import type { EpicRefinementSummary } from "../epics/contracts.js";
import type { FeatureWorkflowSummary } from "../workflow/runtime-contracts.js";
import type { FeatureImplementationEvidenceSummary } from "./implementation-evidence-contracts.js";
import type { CardKind, EpicDeliveryState, MemoryBankStateFolder } from "./identity-contracts.js";
import type { PhaseSummary, WorkItemRelation, WorkItemValidationSummary } from "./scan-contracts.js";

export interface WorkItemCard {
  id: string;
  externalId: string;
  kind: CardKind;
  title: string;
  stateFolder: MemoryBankStateFolder;
  stateLabel: string;
  folderName: string;
  folderPath: string;
  documentPath: string | null;
  documentUpdatedAt: string | null;
  documentRelativePath: string | null;
  epicState: EpicDeliveryState | null;
  epicRefinements: EpicRefinementSummary[];
  specMarkdown: string;
  summary: string;
  linkedEpicIds: string[];
  linkedEpics: WorkItemRelation[];
  linkedFeatureIds: string[];
  linkedFeatures: WorkItemRelation[];
  missingFeatureIds: string[];
  featureWorkflow: FeatureWorkflowSummary | null;
  implementationEvidence: FeatureImplementationEvidenceSummary | null;
  phases: PhaseSummary[];
  validation: WorkItemValidationSummary;
}

export type DocumentReadStatus = "ok" | "missing" | "unreadable";

export type TestCoverageAssessment =
  | "needs_improvement"
  | "ok"
  | "excellent"
  | "perfect"
  | "not_applicable";

export interface TestCoverageMetricSummary {
  assessment: TestCoverageAssessment;
  comment: string;
  coveredLines: number;
  executableLines: number;
  percent: number | null;
}

/** Latest successfully measured coverage receipt for one FEAT. */
export interface TestCoverageSummary {
  /** Coverage of executable production lines changed since StartFeature. */
  feature: TestCoverageMetricSummary;
  /** Context-only coverage across all instrumented production lines. */
  overall: TestCoverageMetricSummary;
  minimumPercent: number;
  targetPercent: number;
  measuredAt: string;
}

/**
 * Response contract for the selected-document detail endpoint.
 * Returned by GET /api/projects/:projectId/work-items/:cardId/document.
 */
export interface WorkItemDocumentDetail {
  /** The raw Markdown content read from disk. */
  content: string;
  /** Full absolute path to the source document on disk. */
  documentPath: string | null;
  /** Relative path from the project root. */
  documentRelativePath: string | null;
  /** ISO timestamp of the last file modification. */
  documentUpdatedAt: string | null;
  /** Card identity, deterministic from the scan. */
  cardId: string;
  externalId: string;
  kind: CardKind;
  /** Current state folder of the resolved work item. */
  stateFolder: MemoryBankStateFolder;
  /** Human-readable state label. */
  stateLabel: string;
  /** Title of the work item. */
  title: string;
  /** Folder name within the state folder. */
  folderName: string;
  /** Whether the document was successfully read. */
  readStatus: DocumentReadStatus;
  /** Error message when readStatus is not "ok". */
  readError: string | null;
  /** Latest final-checkpoint coverage receipt; null until coverage is measured. */
  testCoverage: TestCoverageSummary | null;
}
