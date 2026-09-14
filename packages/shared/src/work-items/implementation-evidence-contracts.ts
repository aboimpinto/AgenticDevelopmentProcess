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

export type FeatureQualityGateKind = "tests" | "gherkin_e2e" | "code_review" | "build" | "lint";

export interface PhaseQualityResolutionInput {
  projectId: string;
  cardId: string;
  phaseNumber: number;
  gate: FeatureQualityGateKind | "completion_recovery";
  action: "repair" | "waive";
  note: string;
  confirmWaiver?: boolean;
  /** Human reports setup is available; this never establishes execution or coverage. */
  confirmExecutionPrerequisites?: boolean;
  expectedUpdatedAt: string;
}

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

/** Build/lint findings are advisory, never fabricated passing results.
 * Required test/review evidence and unjustified waivers remain blocking. */
export function isUnresolvedQualityGate(gate: { readonly status: string; readonly justification: string | null; readonly gate?: string }): boolean {
  if (gate.gate === "build" || gate.gate === "lint") return false;
  return gate.status === "missing" || gate.status === "unknown" ||
    (gate.status === "waived" && !gate.justification?.trim());
}

export function isPhaseQualityWarning(gate: { readonly gate: string; readonly status: string; readonly justification: string | null }): boolean {
  return (gate.gate === "build" || gate.gate === "lint") &&
    (gate.status === "missing" || gate.status === "unknown" || (gate.status === "waived" && !gate.justification?.trim()));
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
