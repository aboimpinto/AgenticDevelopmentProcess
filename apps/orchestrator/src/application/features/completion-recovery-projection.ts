import { existsSync } from "node:fs";
import type { CardMetadataStore } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";
import { completionRecoveryContext } from "./completion-recovery-context.js";
import { completionRecoveryBlockers } from "./completion-recovery-policy.js";
import { queryPackStatus } from "../../manual-test-verification/pack-status-query.js";
import { buildManualTestDeliveryModel } from "../../manual-test-verification/delivery-model.js";
import { approvedCoverage, readCoverageRecovery, recoveryFingerprint, recoveryPath } from "../../manual-test-verification/acceptance-coverage-reconciliation.js";
import { groupCompletionPhaseGaps } from "./completion-phase-gaps.js";
import { recoveryEvidenceSnapshot } from "../../manual-test-verification/recovery-evidence-snapshot.js";
import { freshStatePath, freshVerificationEvidence, readFreshState, verificationCoverageScope } from "../../manual-test-verification/fresh-verification-state.js";
import { projectFreshPhaseEvidence } from "./fresh-phase-evidence.js";
import { freshVerificationRepairAssessment } from "./fresh-verification-repair-context.js";

/** Only features enrolled by an explicit recovery refresh are reprojected. Ordinary flows stay unchanged. */
export async function projectCompletionRecovery(project: StoredProject, feature: WorkItemCard, items: WorkItemCard[], store: CardMetadataStore): Promise<WorkItemCard> {
  const projected = await projectRecovery(project, feature, items, store);
  if (!projected.completionRecovery || projected.kind !== "feature" || projected.stateFolder !== "03_IN_PROGRESS") return projected;
  try {
    const state = readFreshState(feature.folderPath);
    if (state?.stage && state.status !== "blocked" && (projected.featureWorkflow?.activeRun?.runId === state.runId
      || projected.completionRecovery.blockers.some(b => b.id === "recovery-running"))) {
      return { ...projected, completionRecovery: { ...projected.completionRecovery, verificationStage: state.stage, verificationCheckId: state.activeCheckId } };
    }
  } catch { /* The underlying projection already reports unreadable evidence. */ }
  return projected;
}

async function projectRecovery(project: StoredProject, feature: WorkItemCard, items: WorkItemCard[], store: CardMetadataStore): Promise<WorkItemCard> {
  if (feature.kind !== "feature" || feature.stateFolder !== "03_IN_PROGRESS" || (!existsSync(recoveryPath(feature.folderPath)) && !existsSync(freshStatePath(feature.folderPath)))) return feature;
  try {
    const { context, sourceOptions } = completionRecoveryContext(project, feature, items, store);
    let status: Awaited<ReturnType<typeof queryPackStatus>> | undefined;
    try {
      status = await queryPackStatus({ context, currentSourceOptions: sourceOptions });
      feature = { ...feature, featureWorkflow: feature.featureWorkflow ? { ...feature.featureWorkflow, manualTestPackStatus: status } : null };
    } catch { /* A runtime failure remains actionable even if independent manual status is unavailable. */ }
    const fresh = freshVerificationEvidence(feature.folderPath);
    feature = projectFreshPhaseEvidence(feature, fresh);
    if (fresh?.error && fresh.state.status === "blocked") {
      // A protocol/import error has no owning phase. Preserve its full runtime
      // diagnostic and the independent manual status instead of replacing both
      // with an incidental failed attempt to derive phase repair evidence.
      try {
        const repair = freshVerificationRepairAssessment(feature);
        if (repair) return { ...feature, completionRecovery: repair };
      } catch { /* Fall through to the feature-level fresh verification retry. */ }
    }
    if (fresh?.error || !existsSync(recoveryPath(feature.folderPath))) return { ...feature, completionRecovery: { assessedAt: new Date().toISOString(), ready: false,
      blockers: [{ id: "fresh-verification", action: "external", actionLabel: feature.featureWorkflow?.activeRun ? "Wait for verification" : "Refresh fresh verification", message: fresh?.error ?? "Fresh verification finished; coverage assessment is pending." }] } };
    const model = await buildManualTestDeliveryModel(context, sourceOptions, { automatedOnly: true });
    const record = readCoverageRecovery(feature.folderPath)!;
    const snapshot = await recoveryEvidenceSnapshot(context, model);
    const currentRecord = record.baseHash === snapshot.model.acceptedScope.id && record.sourceFingerprint === recoveryFingerprint(feature.folderPath) && record.evidenceFingerprint === snapshot.fingerprint;
    // Existing per-case user receipts can establish the acknowledgement even if
    // older versions withheld its timestamp because automated coverage was pending.
    // This projection records no new result and never feeds assessment evidence.
    let acknowledgedAt = feature.featureWorkflow?.manualTestsCompletedAt ?? null;
    if (!acknowledgedAt && status?.currentPackId && !status.isStale && status.state === "current"
      && status.manualCases?.length && status.manualCases.every(test => test.isReviewed && test.result === "pass")) {
      const results = await store.listManualTestResults(project.id, context.cardKey, status.currentPackId);
      const review = await store.getCurrentManualTestReview(project.id, context.cardKey);
      if (review?.state === "current" && !review.invalidatedAt && review.packId === status.currentPackId && status.manualCases.every(test => {
        const latest = results.filter(result => result.testId === test.id).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id))[0];
        return latest?.result === "pass" && latest.packId === status.currentPackId && latest.reviewId === review?.id;
      })) acknowledgedAt = results.map(result => result.recordedAt).sort().at(-1) ?? null;
    }
    const blockers = completionRecoveryBlockers(feature, Boolean(acknowledgedAt));
    const links = currentRecord ? await approvedCoverage(context, model, null) : [];
    const coverageIssues = verificationCoverageScope(feature.folderPath, snapshot.model)
      .filter(entry => !links.some(link => link.sourceId === entry.sourceId))
      .map(entry => `${entry.sourceId}: ${entry.criterionPreview}`);
    const assessmentError = currentRecord ? record.assessmentError : undefined;
    if (assessmentError) blockers.push({ id: "assessment-incomplete", message: /^Coverage assessment incomplete:/i.test(assessmentError) ? assessmentError : `Coverage assessment incomplete: ${assessmentError}`, action: "external", actionLabel: "Retry readiness refresh",
      prerequisite: "Resolve the assessment error and use Refresh Completion Readiness again. An incomplete assessment does not establish missing tests; do not rerun passing tests or regenerate the manual package." });
    for (const issue of coverageIssues) {
      const sourceId = issue.split(":")[0]!;
      if (assessmentError && model.coverageMap.some(entry => entry.sourceId === sourceId)) continue;
      const unresolved = currentRecord ? record.unresolved.find((entry) => entry.sourceId === sourceId) : undefined;
      const reason = unresolved?.reason;
      if (record.baselineId && unresolved?.diagnosis && unresolved.diagnosis.kind !== "implementation_missing" && !unresolved.execution) {
        blockers.push({ id: `verification-${sourceId}`, action: "external", actionLabel: "Retry readiness assessment",
          message: `${sourceId}: Verification could not establish the accepted obligation. ${reason}`,
          prerequisite: `${unresolved.diagnosis.nextAction} References: ${unresolved.diagnosis.references.join(", ")}. Refresh to resume assessment; no missing implementation has been established.` });
        continue;
      }
      blockers.push({ id: `coverage-${sourceId}`, message: `${issue}${reason ? ` — ${reason}` : ""}`, action: "coverage", actionLabel: "Repair phase coverage",
        ...(unresolved?.diagnosis ? { diagnosis: unresolved.diagnosis } : {}),
        ...(unresolved?.execution ? { execution: unresolved.execution } : {}),
        ...(unresolved?.investigation ? { investigation: true } : {}),
        prerequisite: reason ?? "Coverage must be established by automated tests, their assertions and passing execution evidence. If evidence is unavailable, supply the missing report/environment or repair the responsible phase; refresh to reassess." });
    }
    const proposal = currentRecord && record.proposal?.links.length ? record.proposal : undefined;
    const grouped = groupCompletionPhaseGaps(feature, blockers, proposal, record.coveragePhaseNumber, currentRecord ? record.partialLinks : []);
    const assessment = { ...(currentRecord ? { baselineId: record.baselineId, improvements: record.improvements, verifiedCriterionCount: new Set(record.assessedLinks?.map(l => l.sourceId)).size } : {}), assessedAt: new Date().toISOString(), ready: grouped.blockers.length === 0, ...grouped, ...(proposal ? { proposal } : {}),
      ...(currentRecord && record.contextCompaction && Number.isFinite(record.contextCompaction.beforeTokens) && record.contextCompaction.state !== "running" ? { contextCompaction: record.contextCompaction } : {}) };
    return { ...feature, completionRecovery: assessment, featureWorkflow: feature.featureWorkflow ? { ...feature.featureWorkflow,
      manualTestPackStatus: status ?? feature.featureWorkflow.manualTestPackStatus,
      manualTestsCompletedAt: acknowledgedAt,
    } : null };
  } catch (error) {
    return { ...feature, completionRecovery: { assessedAt: new Date().toISOString(), ready: false,
      blockers: [{ id: "recovery-read", message: error instanceof Error ? error.message : "Recovery evidence is unreadable.", action: "external", actionLabel: "Restore recovery evidence", prerequisite: `Inspect ${recoveryPath(feature.folderPath)} and the feature source documents; restore valid evidence, then refresh.` }] } };
  }
}
