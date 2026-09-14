import type { FeaturePhaseQualityGateDecision, FeatureQualityGateKind } from "@hepha/shared";
import { createJsonExchangeProtocol, readExchangeSchema } from "./json-exchange-protocol.js";

export interface PhaseGateFlags { needCodeReview: boolean; needTestCoverage: boolean }
export interface PhaseGateEvidenceReference { path: string; toolCallId?: string }
export interface PhaseGateRecord {
  phaseId: string;
  flags: PhaseGateFlags;
  criteria: Array<{ id: string; description: string }>;
  checks: Array<{ id: string; gate: Exclude<FeatureQualityGateKind, "code_review">; required: boolean;
    command: string; cwd: string; outcome: "pending" | "passed" | "failed" | "not_run";
    evidence: PhaseGateEvidenceReference[]; reason?: string }>;
  review: { outcome: "pending" | "approved" | "changes_required" | "not_applicable"; reportPath?: string; reason?: string };
  coverage: { outcome: "pending" | "sufficient" | "missing" | "not_applicable"; reason?: string;
    criteria: Array<{ criterionId: string; checkIds: string[]; testPaths: string[]; assertions: string }> };
  revisions?: Array<{ before: PhaseGateFlags; after: PhaseGateFlags; reason: string; implementedScope: string; evidencePaths: string[] }>;
}
export const phaseGatesProtocol = createJsonExchangeProtocol<PhaseGateRecord>("phase.gates", readExchangeSchema("phase-gates-payload-v1"));
export interface PhaseGateProof {
  check(check: PhaseGateRecord["checks"][number]): string | null;
  review(path: string): string | null;
  source(path: string): boolean;
}

/** A phase identity binds a record; it never selects a gate, role or exception. */
export function evaluatePhaseGates(record: PhaseGateRecord, proof: PhaseGateProof): FeaturePhaseQualityGateDecision[] {
  const decisions = new Map<FeatureQualityGateKind, FeaturePhaseQualityGateDecision>();
  const missing = (gate: FeatureQualityGateKind, reason: string) => decisions.set(gate, {
    gate, status: "missing", evidencePaths: [], justification: reason,
  });
  const passedChecks = new Set<string>(), seen = new Set<string>();
  for (const check of record.checks) {
    if (seen.has(check.id)) { missing(check.gate, `Duplicate configured check: ${check.id}`); continue; }
    seen.add(check.id);
    const problem = check.outcome !== "passed" ? `${check.id}: ${check.outcome}${check.reason ? ` — ${check.reason}` : ""}` : proof.check(check);
    if (!problem) passedChecks.add(check.id);
    if (!check.required) continue;
    if (problem) missing(check.gate, problem);
    else if (!decisions.has(check.gate)) decisions.set(check.gate, { gate: check.gate, status: "satisfied",
      evidencePaths: check.evidence.map(e => e.path), justification: "Configured execution verified." });
  }
  if (record.flags.needTestCoverage) {
    const assessed = new Set<string>();
    let gap = record.coverage.outcome !== "sufficient" ? record.coverage.reason ?? `Coverage assessment: ${record.coverage.outcome}` : "";
    if (new Set(record.criteria.map(c => c.id)).size !== record.criteria.length) gap ||= "Duplicate acceptance criterion identity.";
    if (!record.criteria.length) gap ||= "Meaningful coverage requires the phase acceptance criteria.";
    for (const item of record.coverage.criteria) {
      if (assessed.has(item.criterionId) || !record.criteria.some(c => c.id === item.criterionId)) gap ||= `Unknown or duplicate coverage criterion: ${item.criterionId}`;
      assessed.add(item.criterionId);
      // Supporting health checks may accompany a behavioral test; they cannot replace it.
      if (!item.checkIds.some(id => passedChecks.has(id) && record.checks.some(c => c.id === id && ["tests", "gherkin_e2e"].includes(c.gate)))
        || item.checkIds.some(id => !passedChecks.has(id) && !record.checks.some(c => c.id === id && ["build", "lint"].includes(c.gate)))) gap ||= `Criterion ${item.criterionId} lacks passing test execution.`;
      if (!item.testPaths.length || item.testPaths.some(path => !proof.source(path))) gap ||= `Criterion ${item.criterionId} lacks its test/assertion source.`;
    }
    for (const item of record.criteria) if (!assessed.has(item.id)) gap ||= `Missing acceptance coverage: ${item.id} — ${item.description}`;
    if (gap) missing("tests", gap);
    else if (!decisions.has("tests")) decisions.set("tests", { gate: "tests", status: "satisfied", evidencePaths: [], justification: "All declared acceptance criteria have assessed assertions and passing evidence." });
  } else if (record.coverage.criteria.length > 0) {
    missing("tests", "The record disables acceptance coverage but supplies an active acceptance assessment. Reconcile needTestCoverage with the implemented scope; numeric measurement applicability does not decide this flag. Preserve the criterion mappings while correcting the declaration.");
  } else if (record.coverage.outcome !== "not_applicable" || !record.coverage.reason?.trim()) {
    missing("tests", "Coverage is disabled but its scope justification is missing.");
  }
  if (!decisions.has("tests")) decisions.set("tests", { gate: "tests", status: "not_applicable", evidencePaths: [], justification: record.coverage.reason ?? "No required test check declared." });
  if (record.flags.needCodeReview) {
    const problem = record.review.outcome !== "approved" ? record.review.reason ?? `Code review: ${record.review.outcome}`
      : !record.review.reportPath ? "Approved review has no report." : proof.review(record.review.reportPath);
    if (problem) missing("code_review", problem);
    else decisions.set("code_review", { gate: "code_review", status: "satisfied", evidencePaths: [record.review.reportPath!], justification: "Required review report is approved." });
  } else decisions.set("code_review", { gate: "code_review",
    status: record.review.outcome === "not_applicable" && record.review.reason?.trim() ? "not_applicable" : "missing",
    evidencePaths: [], justification: record.review.reason ?? "Disabled review requires a scope justification." });
  return [...decisions.values()];
}

export function validatePhaseGateRevision(before: PhaseGateRecord, after: PhaseGateRecord, source: (path: string) => boolean): string | null {
  if (before.phaseId !== after.phaseId) return "The record cannot change its assigned phase identity.";
  const removedChecks = before.checks.some(check => check.required && !after.checks.some(c => c.id === check.id && c.required));
  const removedCriteria = before.criteria.some(c => !after.criteria.some(a => a.id === c.id));
  if (sameFlags(before.flags, after.flags) && !removedChecks && !removedCriteria) return null;
  const revision = after.revisions?.at(-1);
  if (!revision || !sameFlags(revision.before, before.flags) || !sameFlags(revision.after, after.flags)
    || !revision.reason.trim() || !revision.implementedScope.trim() || !revision.evidencePaths.length || revision.evidencePaths.some(p => !source(p))) return "Flag revision needs previous/new values, implemented scope, justification and source evidence.";
  if ((removedChecks || removedCriteria || (before.flags.needTestCoverage && !after.flags.needTestCoverage) || (before.flags.needCodeReview && !after.flags.needCodeReview))
    && (before.checks.some(c => c.required && ["tests", "gherkin_e2e"].includes(c.gate) && c.outcome === "failed") || before.review.outcome === "changes_required")) return "Resolve recorded failing checks/review findings before disabling a gate.";
  return null;
}

function sameFlags(a: PhaseGateFlags, b: PhaseGateFlags) { return a.needCodeReview === b.needCodeReview && a.needTestCoverage === b.needTestCoverage; }
