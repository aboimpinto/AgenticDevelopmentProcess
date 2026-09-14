export interface AcceptanceCoverageLink {
  sourceId: string;
  kind: "manual" | "automated";
  evidenceId: string;
  explanation: string;
  stepNumbers?: number[];
}

/** A scoped finding, not passing evidence or authority to mutate a repository. */
export interface VerificationDiagnosis {
  kind: "implementation_missing" | "execution_missing" | "environment_blocked" | "evidence_missing" | "investigation_required";
  explanation: string;
  references: string[];
  nextAction: string;
}

/** Assessor-suggested execution plan, never executable authority or proof of a pass. */
export interface CoverageExecutionRequirement {
  targetId?: string;
  configurationFingerprint?: string;
  command: string;
  testPaths: string[];
  prerequisite?: string;
}

export interface CompletionRecoveryBlocker {
  diagnosis?: VerificationDiagnosis;
  investigation?: boolean;
  id: string;
  message: string;
  phaseNumber?: number | null;
  action: "phase" | "implementation" | "user_review" | "manual_tests" | "findings" | "coverage" | "coverage_owner" | "external";
  actionLabel: string;
  prerequisite?: string;
  execution?: CoverageExecutionRequirement;
}

export interface CompletionRecoveryAssessment {
  baselineId?: string;
  verifiedCriterionCount?: number;
  improvements?: { id: string; observation: string; rationale: string; references: string[]; status: "proposed-for-future-planning" }[];
  verificationStage?: "inspecting" | "correcting" | "preparing" | "testing" | "checking" | "waiting" | "validating" | "assessing";
  verificationCheckId?: string;
  contextCompaction?: ContextCompactionActivity;
  assessedAt: string;
  ready: boolean;
  blockers: CompletionRecoveryBlocker[];
  proposal?: { id: string; links: AcceptanceCoverageLink[] };
  phaseGaps?: PhaseCompletionQualityGap[];
}

/** Informational only; never grants completion or removes the recovery lock. */
export interface ContextCompactionActivity {
  state: "running" | "completed" | "failed";
  level: "light" | "strong";
  beforeTokens: number;
  afterTokens?: number;
  modelId?: string;
  contextWindowTokens?: number;
  updatedAt: string;
}

export interface PhaseCompletionQualityGap {
  diagnoses?: { sourceId: string; diagnosis: VerificationDiagnosis }[];
  id: string;
  phaseNumber: number;
  phaseTitle: string;
  kind: "acceptance_coverage" | "task_evidence" | "coverage_confirmation" | "execution_evidence" | "evidence_investigation" | "verification_failure";
  title: string;
  details: string[];
  sourceIds: string[];
  instruction: string;
  proposalId?: string;
  proposedLinks?: AcceptanceCoverageLink[];
  executions?: CoverageExecutionRequirement[];
}

export interface CompletionRecoveryResponse {
  items: import("../work-items/contracts.js").WorkItemCard[];
  assessment: CompletionRecoveryAssessment;
  message: string;
}
