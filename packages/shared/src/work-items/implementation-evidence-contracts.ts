export type FeatureImplementationEvidenceSource =
  | "phase"
  | "code-review"
  | "completion-report"
  | "start-report"
  | "planning-artifact"
  | "task-ledger"
  | "manual-acceptance"
  | "other-artifact";

export type FeatureCodeReviewResult =
  | "approved"
  | "approved_with_notes"
  | "needs_changes"
  | "blocked"
  | "unknown";

export type FeatureQualityGateStatus =
  | "satisfied"
  | "waived"
  | "missing"
  | "not_applicable"
  | "unknown";

export type FeatureQualityGateKind = "tests" | "gherkin_e2e" | "code_review";

export interface FeatureChangedFileSummary {
  path: string;
  relativePath: string | null;
  phases: number[];
  reviewReportPaths: string[];
  sources: FeatureImplementationEvidenceSource[];
}

export interface FeatureCodeReviewSummary {
  fileName: string;
  phaseNumber: number | null;
  phaseTitle: string | null;
  reportPath: string;
  reportRelativePath: string | null;
  result: FeatureCodeReviewResult;
  reviewedFiles: string[];
  updatedAt: string;
}

export interface FeaturePhaseQualityGateDecision {
  evidencePaths: string[];
  gate: FeatureQualityGateKind;
  justification: string | null;
  status: FeatureQualityGateStatus;
}

export interface FeaturePhaseQualitySummary {
  changedFiles: string[];
  codeFiles: string[];
  documentationFiles: string[];
  gates: FeaturePhaseQualityGateDecision[];
  phaseNumber: number | null;
  phaseStatus: string;
  phaseTitle: string;
  testFiles: string[];
  warnings: string[];
}

export interface FeatureImplementationEvidenceSummary {
  changedFiles: FeatureChangedFileSummary[];
  codeReviews: FeatureCodeReviewSummary[];
  phaseQualityGates: FeaturePhaseQualitySummary[];
}
