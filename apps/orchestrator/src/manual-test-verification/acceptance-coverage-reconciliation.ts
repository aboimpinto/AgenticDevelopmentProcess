import { decodeFeatureAcceptance, featureAcceptanceExchange } from "./feature-acceptance-assessment.js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AcceptanceCoverageLink, CoverageExecutionRequirement, PhaseCompletionQualityGap, VerificationDiagnosis } from "@hepha/shared";
import { buildManualTestDeliveryModel, hashManualTestDeliveryModel, type ManualTestDeliveryModel } from "./delivery-model.js";
import type { ManualTestAdapterContext } from "./adapter-context.js";
import type { SourceDiscoveryOptions } from "./source-discovery.js";
import { writeFileAtomic } from "./artifact-storage.js";
import { readFeatureDocuments } from "./steered-pack-preparation.js";
import { randomUUID } from "node:crypto";
import { recoveryEvidenceSnapshot } from "./recovery-evidence-snapshot.js";

export interface CoverageRecoveryRecord {
  baselineId?: string;
  assessedLinks?: AcceptanceCoverageLink[];
  assessment?: import("./feature-acceptance-assessment.js").FeatureAcceptanceAssessment;
  improvements?: import("./accepted-feature-scope.js").ReadinessImprovement[];
  contextCompaction?: import("@hepha/shared").ContextCompactionActivity;
  schemaVersion: "hepha-completion-recovery/v1";
  packId: string | null;
  baseHash: string;
  sourceFingerprint: string;
  evidenceFingerprint?: string;
  assessmentVersion?: string;
  executionRoutingVersion?: "existing-execution/v1";
  executionPlanFingerprint?: string;
  workerDiagnosedSourceIds?: string[];
  assessmentError?: string;
  sourceOptions: SourceDiscoveryOptions;
  approvedLinks: AcceptanceCoverageLink[];
  /** Valid contributions to unresolved criteria. Never approval/completion candidates. */
  partialLinks?: AcceptanceCoverageLink[];
  approvedBindings?: Record<string, string>;
  approvals: { proposalId: string; confirmedAt: string; links: AcceptanceCoverageLink[] }[];
  proposal?: { id: string; links: AcceptanceCoverageLink[] };
  unresolved: { sourceId: string; reason: string; investigation?: boolean; execution?: CoverageExecutionRequirement; diagnosis?: VerificationDiagnosis }[];
  phaseGaps?: PhaseCompletionQualityGap[];
  coveragePhaseNumber?: number;
}
export const recoveryPath = (folder: string) => resolve(folder, "manual-test-verification", "completion-recovery.json");
export const recoveryFingerprint = (folder: string) => readFeatureDocuments(folder, "acceptance coverage evidence").split("\n")[0]!;
export function readCoverageRecovery(folder: string): CoverageRecoveryRecord | null {
  const path = recoveryPath(folder);
  if (!existsSync(path)) return null;
  const record = JSON.parse(readFileSync(path, "utf8")) as CoverageRecoveryRecord;
  if (record.schemaVersion !== "hepha-completion-recovery/v1" || !Array.isArray(record.approvedLinks) || !Array.isArray(record.approvals)) throw new Error("Invalid completion recovery record. Inspect completion-recovery.json before retrying.");
  return record;
}
export function saveCoverageRecovery(folder: string, record: CoverageRecoveryRecord) {
  const previous = readCoverageRecovery(folder);
  if ((previous?.approvals.length || previous?.assessment) && (previous.baseHash !== record.baseHash || previous.packId !== record.packId || previous.sourceFingerprint !== record.sourceFingerprint || previous.evidenceFingerprint !== record.evidenceFingerprint)) {
    writeFileAtomic(resolve(folder, "manual-test-verification", "completion-recovery-history", `${randomUUID()}.json`), JSON.stringify(previous, null, 2));
  }
  writeFileAtomic(recoveryPath(folder), JSON.stringify(record, null, 2));
}

/** Validate a complete proposed/approved group, never a single partial contribution.
 * Native semantic mappings require a validated assessment against the accepted baseline. Legacy explicit confirmations remain readable. */
export function validateCoverageLinks(value: unknown, model: ManualTestDeliveryModel): AcceptanceCoverageLink[] {
  const links = validateCoverageContributions(value, model);
  for (const sourceId of new Set(links.map(link => link.sourceId))) {
    const source = model.manifestEntries.find(entry => entry.sourceId === sourceId)!;
    if (!model.acceptedScope && /\b(?:automated|automation|integration tests?|e2e|playwright|twintests?|test coverage)\b/i.test((source.criterionPreview ?? "").replace(/\b(?:cannot|can not|must not|not)\s+(?:be\s+)?automated\b/gi, "manual"))
      && !links.some(link => link.sourceId === sourceId && link.kind === "automated")) {
      throw new Error("A criterion explicitly requiring automated verification cannot be resolved with a manual-only link.");
    }
  }
  return links;
}

/** Reference/provenance validation only. Partial proof cannot settle a criterion. */
export function validateCoverageContributions(value: unknown, model: ManualTestDeliveryModel): AcceptanceCoverageLink[] {
  if (!Array.isArray(value) || value.length > 500) throw new Error("Coverage links must be a bounded list.");
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid coverage link.");
    const link = raw as AcceptanceCoverageLink;
    if (!model.manifestEntries.some((entry) => entry.sourceId === link.sourceId) || typeof link.explanation !== "string" || !link.explanation.trim() || link.explanation.length > 4000) throw new Error("Coverage link has an unknown criterion or missing explanation.");
    if (link.kind === "manual") {
      const test = model.tests.find((test) => test.id === link.evidenceId);
      if (model.acceptedScope) throw new Error("Feature acceptance requires automated test evidence. Manual acknowledgements are independent.");
      if (!test || !Array.isArray(link.stepNumbers) || !link.stepNumbers.length || !link.stepNumbers.every((step) => Number.isInteger(step) && step > 0 && step <= test.steps.length)) throw new Error("Manual coverage must cite an existing case and concrete step numbers.");
    } else if (link.kind === "automated") {
      const evidence = model.automatedEvidence.find((entry) => entry.id === link.evidenceId);
      const proof = evidence?.verifiedExecution;
      const verified = proof ? proof.schema === "verified-execution/v1" && /^[a-f\d]{7,40}$/i.test(proof.testedRevision)
        && Number.isSafeInteger(proof.executedCount) && proof.executedCount > 0 && !!proof.sourceState.trim()
        && proof.reportHashes.length > 0 && proof.reportHashes.every(hash => /^[a-f\d]{64}$/i.test(hash))
        && !!evidence?.executionIdentities?.length && evidence.executionIdentities.length <= proof.executedCount
        : !evidence?.id.startsWith("receipt-") && /\b[1-9]\d*\s+(?:tests?|scenarios?)\b/i.test(evidence?.detail ?? "")
          && /(?:^|;\s*)(?:tested\s+)?(?:revision|commit)\s*[:=]?\s*[a-f0-9]{7,40}\b/i.test(evidence?.detail ?? "");
      if (!evidence || evidence.status !== "executed-passed" || !evidence.command || !evidence.sourcePath || !verified) throw new Error("Automated coverage needs passing execution, a command, a tested revision, a source report and non-zero selection evidence.");
    } else throw new Error("Coverage cannot waive, defer or invent an evidence kind.");
    return { sourceId: link.sourceId, kind: link.kind, evidenceId: link.evidenceId, explanation: link.explanation,
      ...(link.kind === "manual" ? { stepNumbers: link.stepNumbers } : {}) };
  });
}

export async function approvedCoverage(context: ManualTestAdapterContext, model: ManualTestDeliveryModel, packId: string | null) {
  const folder = context.featFolderPath;
  const record = readCoverageRecovery(folder);
  if (!record || record.sourceFingerprint !== recoveryFingerprint(folder)) return [];
  const snapshot = await recoveryEvidenceSnapshot(context, model);
  if (record.baseHash !== snapshot.model.acceptedScope.id || record.evidenceFingerprint !== snapshot.fingerprint) return [];
  const confirmed = record.approvals.flatMap((approval) => approval.confirmedAt ? approval.links : []);
  if (record.approvedLinks.some((link) => !confirmed.some((entry) => JSON.stringify(entry) === JSON.stringify(link)))) throw new Error("Coverage links have no confirmation receipt.");
  let assessed: AcceptanceCoverageLink[] = [];
  if (record.baselineId === snapshot.model.acceptedScope?.id && record.assessment?.baselineId === record.baselineId) {
    const requested = new Set(record.assessment.criteria.map(c => c.sourceId));
    const validated = decodeFeatureAcceptance(featureAcceptanceExchange.encode(record.assessment), { ...snapshot.model, coverageMap: snapshot.model.coverageMap.filter(c => requested.has(c.sourceId)) });
    assessed = validated.proposal.links;
    if (JSON.stringify(assessed) !== JSON.stringify(record.assessedLinks ?? [])) throw new Error("Assessed links do not match the validated accepted-scope assessment.");
  }
  return validateCoverageLinks([...record.approvedLinks, ...assessed], snapshot.model);
}

export async function hasReconciledStoredCoverage(context: ManualTestAdapterContext, pack: { id: string; manifestHash: string }) {
  const record = readCoverageRecovery(context.featFolderPath);
  if (!record || record.packId !== pack.id || record.baseHash !== pack.manifestHash) return false;
  const model = await buildManualTestDeliveryModel(context, record.sourceOptions);
  if (hashManualTestDeliveryModel(model) !== pack.manifestHash || model.invalidManualTests.some(c => c.id !== "authoring")) return false;
  const links = await approvedCoverage(context, model, pack.id);
  return links.length > 0 && model.coverageMap.filter((entry) => entry.coverageStatus === "uncovered").every((entry) => links.some((link) => link.sourceId === entry.sourceId));
}
