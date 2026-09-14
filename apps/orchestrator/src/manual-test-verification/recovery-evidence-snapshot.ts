import { buildAcceptedFeatureScope, readinessModel } from "./accepted-feature-scope.js";
import { readPhaseAcceptanceContext } from "./phase-acceptance-context.js";
import { createHash } from "node:crypto";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import { type ManualTestDeliveryModel } from "./delivery-model.js";
import { readRecoveryExecutionEvidence } from "./recovery-execution-evidence.js";
import { COVERAGE_ASSESSMENT_VERSION } from "./coverage-assessment-batches.js";
import { currentWorkerDiagnoses } from "./verification-worker-diagnoses.js";
import { freshVerificationEvidence } from "./fresh-verification-state.js";

export async function recoveryEvidenceSnapshot(context: ManualTestAdapterContext, model: ManualTestDeliveryModel) {
  const fresh = freshVerificationEvidence(context.featFolderPath);
  const execution = fresh ? { ...fresh, diagnostics: fresh.error ? [fresh.error] : [] }
    : readRecoveryExecutionEvidence(context.featFolderPath, context.projectRoot, context.featExternalId);
  const acceptedScope = buildAcceptedFeatureScope(context, model);
  const phaseAcceptanceAssessments = readPhaseAcceptanceContext(context.featFolderPath, context.projectRoot, fresh?.state.plan?.checks, fresh?.state.snapshots?.map(s => s.root));
  const recoveryContext = { ...(phaseAcceptanceAssessments.length ? { phaseAcceptanceAssessments } : {}), currentPackId: null, manualResults: [], executionDiagnostics: execution.diagnostics,
    ...(fresh ? { freshVerification: { runId: fresh.state.runId, status: fresh.error ? "blocked" : "passed", sourceSnapshots: fresh.state.snapshots, phases: fresh.state.plan?.phases,
      // Inspection is coverage context, never part of the canonical execution receipt.
      checks: fresh.state.plan?.checks.map(check => ({ id: check.id, reason: check.reason, testPaths: check.testPaths })) } } : {}) };
  const diagnoses = currentWorkerDiagnoses(context.featFolderPath, context.projectRoot);
  // Diagnosis is routing context, not new execution. Do not rerun a potentially
  // expensive coverage assessment merely because a preflight returned a finding.
  const fingerprint = createHash("sha256").update(JSON.stringify([COVERAGE_ASSESSMENT_VERSION, execution.fingerprint, acceptedScope.id, recoveryContext])).digest("hex");
  // This enriched view deliberately does not feed the canonical pack hash. Restoring execution
  // evidence must not force regeneration, re-review or rerunning unchanged manual cases.
  return { fingerprint, model: readinessModel({ ...model, acceptedScope, automatedEvidence: fresh ? execution.evidence : [...execution.evidence, ...model.automatedEvidence], recoveryContext, verificationDiagnoses: fresh ? [] : diagnoses.findings }) };
}
