import { LOGICAL_ACCEPTANCE_COVERAGE_CONTRACT } from "../prompts/logical-acceptance-coverage-contract.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import type { ImplementationWorkerInput } from "../phases/implementation-worker-application.js";
import { phaseGatesProtocol, validatePhaseGateRevision } from "../../exchanges/phase-gates.js";
import { loadPhaseGateRecord, phaseGateProof, phaseGateRecordPath } from "../../exchanges/phase-gates-repository.js";
import { isUnresolvedQualityGate } from "@hepha/shared";

export function firstPhaseGateRepair(feature: WorkItemCard) {
  const summaries = feature.implementationEvidence?.phaseQualityGates ?? [];
  return summaries.find(s => /^(COMPLETED|SKIPPED|BLOCKED|IN_PROGRESS|IN PROGRESS)$/i.test(s.phaseStatus)
    && s.gates.some(isUnresolvedQualityGate));
}

export function gateExchangePrompt(documentPath: string, observationsPath: string): string {
  return `\nPhase gate exchange (same policy for every phase): write ${phaseGateRecordPath(documentPath)} before accepting this phase.
${LOGICAL_ACCEPTANCE_COVERAGE_CONTRACT}
Use the phase document filename as its opaque phaseId. needCodeReview and needTestCoverage are independent booleans predicted at refinement and revised only with implemented scope, reasons and evidence. No number, title, DTO/document/checkpoint name or file extension selects gates.
needTestCoverage means meaningful acceptance coverage, not a numeric percentage. No numeric threshold, unavailable instrumentation, or an old measurement N/A cannot set it to false. Predict/revise it from the implemented scope and observable acceptance behavior. When importing legacy documents, distinguish numeric measurement from acceptance coverage; never copy a numeric N/A into this flag. Preserve existing acceptance mappings; do not delete them to make a disabled flag validate. Use the supplied schema as convention authority, not older feature examples or session transcripts (which are execution evidence only).
List each acceptance criterion, its meaningful test assertions and source paths, and the configured checks. Required build/lint/test executions remain required even when coverage/review flags are false. No E2E test per phase criterion; preserve the separately assigned EPIC workflow obligations.
Record actual outcomes, not expected results. For shell evidence reference the host observation ledger ${observationsPath} and the toolCallId of the actual bash execution. Existing Pi session JSONL can be referenced instead; inspect original results before rerunning. Do not reference a shell read of a report as execution. runId and timestamps are optional audit fields.
Inspect all assertions and important behavior; repair gaps and failed checks/review findings in this phase, update the FeatureDescription test manifest, rerun/re-review until satisfied. After gates pass, accept this phase and synchronize its status and task ledger with FeatureTasks.md. Do not activate later phases during repair. A blocked quality gate is work to repair, not a reason to ask the user to click Continue. Escalate only a concrete architectural/intent/authority impasse with attempts, evidence and the exact help needed.
The exact JSON Schema below defines the envelope and payload. Markdown is its readable projection; do not derive gate decisions from prose result counts.
${phaseGatesProtocol.renderContract()}`;
}

export function observePhaseGateTools(path: string): NonNullable<ImplementationWorkerInput["onPiEvent"]> {
  return event => {
    if (!["tool_execution_start", "tool_execution_end"].includes(String(event.type))) return;
    // Do not persist model reasoning or entire assistant messages in the ledger.
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(event) + "\n");
  };
}

/** Changes to timestamps, descriptions and report wording cannot reset recovery. */
export function phaseGateProgressKey(feature: WorkItemCard, documentPath: string, projectRoot?: string): string {
  const loaded = loadPhaseGateRecord(documentPath);
  const record = loaded?.valid ? loaded.value.payload : null;
  const proof = phaseGateProof(documentPath, projectRoot, record?.checks.map(c => c.cwd));
  const changedSources = (feature.implementationEvidence?.changedFiles ?? []).map(f => f.path).filter(p => !/\.(?:md|jsonl|log)$/i.test(p));
  const data = record ? {
    flags: record.flags,
    checks: record.checks.map(c => [c.id, c.required, c.outcome]),
    review: record.review.outcome, coverage: record.coverage.outcome,
    criteria: record.coverage.criteria.map(c => [c.criterionId, c.checkIds, c.testPaths]),
    sources: [...new Set([...record.coverage.criteria.flatMap(c => c.testPaths), ...changedSources])].map(p => {
      const paths = [...(projectRoot ? [resolve(projectRoot, p)] : []), ...record.checks.map(c => resolve(projectRoot ?? dirname(documentPath), c.cwd, p)), resolve(dirname(documentPath), "..", p), resolve(dirname(documentPath), p)];
      const path = paths.find(p => existsSync(p));
      return [p, proof.source(p) && path ? createHash("sha256").update(readFileSync(path)).digest("hex") : null];
    }),
  } : (feature.implementationEvidence?.phaseQualityGates ?? []).map(s => ({ phase: s.phaseNumber, gates: s.gates.map(g => [g.gate, g.status]) }));
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

export function gateRevisionProblem(before: ReturnType<typeof loadPhaseGateRecord>, documentPath: string, root: string) {
  const after = loadPhaseGateRecord(documentPath);
  if (before?.valid && !after) return "The phase gate contract was removed; restore the declaration and repair its evidence.";
  if (before?.valid && after?.valid) return validatePhaseGateRevision(before.value.payload, after.value.payload, phaseGateProof(documentPath, root, after.value.payload.checks.map(c => c.cwd)).source);
  return null;
}
