import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import type { PhaseSummary, FeaturePhaseQualityGateDecision } from "@hepha/shared";
import type { AggregateVerificationResult } from "../final-verification-types.js";
import { getPhaseExecutionContractForDocument, loadPhaseExecutionContract, phaseRequiresVerification, type PhaseExecutionRole } from "../phase-execution-contract.js";
import { writeFileAtomic } from "../manual-test-verification/artifact-storage.js";
import { phaseVerificationProtocol, validatePhaseVerification, type PhaseVerificationPayload } from "./phase-verification-protocol.js";
import { DEFAULT_PROFILE_RELATIVE_PATH, loadVerificationProfile } from "../final-verification-profile-loader.js";

export const phaseVerificationPath = (phase: Pick<PhaseSummary, "documentPath">) => `${phase.documentPath}.verification.json`;

/** Only the host verification executor calls this producer. Agent-authored
 * result claims must first pass that executor's independent evidence checks. */
export function persistPhaseVerification(phase: PhaseSummary, aggregate: AggregateVerificationResult, role: PhaseExecutionRole, audit?: unknown): void {
  const folder = resolve(dirname(phase.documentPath), "..");
  const declared = getPhaseExecutionContractForDocument(loadPhaseExecutionContract(folder).contract, phase.documentPath, folder);
  const payload: PhaseVerificationPayload = {
    phaseId: declared?.id ?? basename(phase.documentPath), role,
    status: aggregate.status === "skipped" ? "blocked" : aggregate.status,
    ...(aggregate.status !== "passed" ? { reason: aggregate.blockedReason || `Verification ${aggregate.status}: ${aggregate.failedRequiredChecks.join(", ") || "required execution unavailable"}` } : {}),
    checks: aggregate.checks.map(check => ({ id: check.checkId, intent: check.intent, required: check.required,
      outcome: check.outcome, command: check.command, cwd: check.workingDirectory, exitCode: check.exitCode,
      evidence: check.outputSummary, description: check.description })),
  };
  const errors = validatePhaseVerification(payload, { phaseId: declared?.id ?? payload.phaseId, role: declared?.role ?? role, productionCodeChanged: false });
  if (errors.length) throw new Error(`EXCHANGE_EVIDENCE_INVALID: ${JSON.stringify(errors)}`);
  writeFileAtomic(phaseVerificationPath(phase), phaseVerificationProtocol.encode(payload, audit));
}

/** A present native exchange is authoritative over Markdown projections. Invalid
 * native JSON gets a protocol diagnosis, never silent legacy/prose fallback. */
export function readPhaseVerification(phase: PhaseSummary, productionCodeChanged: boolean, projectRoot?: string, testCodeChanged = false): FeaturePhaseQualityGateDecision[] | null {
  const path = phaseVerificationPath(phase);
  const unresolved = (message: string): FeaturePhaseQualityGateDecision[] => [{ gate: "tests", status: "unknown", evidencePaths: [path], justification: message }];
  if (!existsSync(path)) {
    return existsSync(phase.documentPath) && readFileSync(phase.documentPath, "utf8").includes("<!-- hepha:phase-verification:json-v1 -->")
      ? unresolved("EXCHANGE_PROTOCOL_MISSING: Restore the recorded JSON verification result; Markdown cannot replace a migrated exchange.") : null;
  }
  try {
    const decoded = phaseVerificationProtocol.decode(readFileSync(path, "utf8"));
    if (!decoded.valid) return unresolved(`EXCHANGE_PROTOCOL_INVALID: ${JSON.stringify(decoded.diagnostics)}. Repair the JSON representation; no test failure is inferred.`);
    const featureFolder = resolve(dirname(phase.documentPath), "..");
    const loaded = loadPhaseExecutionContract(featureFolder);
    const contract = getPhaseExecutionContractForDocument(loaded.contract, phase.documentPath, featureFolder);
    const payload = decoded.value.payload;
    if (!contract) return unresolved("EXCHANGE_EVIDENCE_INVALID: The declared phase contract is required to validate the role; the result cannot choose its own rules.");
    const role = contract.role;
    const profile = projectRoot && payload.status !== "not_applicable" ? loadVerificationProfile(resolve(projectRoot, DEFAULT_PROFILE_RELATIVE_PATH)) : null;
    if (profile && !profile.valid) return unresolved(`EXCHANGE_EVIDENCE_INVALID: Configured verification profile cannot be resolved: ${profile.issues.map(issue => issue.message).join("; ")}`);
    if (payload.status === "not_applicable" && contract && phaseRequiresVerification(contract)) return unresolved("EXCHANGE_EVIDENCE_INVALID: Not applicable conflicts with declared required verification tasks.");
    const errors = validatePhaseVerification(payload, { phaseId: contract.id, role, productionCodeChanged, testCodeChanged,
      ...(profile?.profile ? { expectedChecks: profile.profile.checks.filter(check => check.runAt !== "final_checkpoint" || role === "final_checkpoint")
        .map(check => ({ id: check.id, intent: check.intent, required: check.required, command: check.command, cwd: check.workingDirectory })) } : {}),
    });
    if (errors.length) return unresolved(`EXCHANGE_EVIDENCE_INVALID: ${JSON.stringify(errors)}`);
    if (payload.status === "not_applicable") return [{ gate: "tests", status: "not_applicable", justification: payload.reason!, evidencePaths: [path] }];
    const decisions: FeaturePhaseQualityGateDecision[] = [];
    if (!payload.checks.some(check => check.intent === "test" && check.required)) {
      decisions.push({ gate: "tests", status: "not_applicable", evidencePaths: [path], justification: "The declared check set contains no required test execution." });
    }
    for (const [intent, gate] of [["test", "tests"], ["build", "build"], ["lint", "lint"]] as const) {
      const checks = payload.checks.filter(check => check.intent === intent && check.required);
      if (!checks.length) continue;
      decisions.push({ gate, status: checks.every(check => check.outcome === "passed") ? "satisfied" : "missing",
        evidencePaths: [path], justification: checks.map(check => `${check.id}: ${check.outcome}${check.evidence ? ` — ${check.evidence}` : ""}`).join("\n") });
    }
    if (payload.status !== "passed" && !decisions.some(gate => gate.status === "missing")) decisions.push({
      gate: "tests", status: "missing", evidencePaths: [path], justification: payload.reason ?? `Verification ${payload.status}`,
    });
    return decisions;
  } catch (error) {
    return unresolved(`EXCHANGE_PROTOCOL_INVALID: ${error instanceof Error ? error.message : "Unreadable phase verification exchange"}. Existing execution evidence is preserved.`);
  }
}

/** Automatically record the admitted no-verification obligation for any phase role. */
export function persistDocumentationApplicability(featureFolder: string, phase: PhaseSummary): void {
  if (!existsSync(phase.documentPath)) return;
  const loaded = loadPhaseExecutionContract(featureFolder);
  const contract = getPhaseExecutionContractForDocument(loaded.contract, phase.documentPath, featureFolder);
  if (!contract || phaseRequiresVerification(contract)) return;
  const markdown = readFileSync(phase.documentPath, "utf8");
  // Never overwrite an executed or unresolved verification exchange with N/A.
  if (existsSync(phaseVerificationPath(phase))) return;
  writeFileAtomic(phaseVerificationPath(phase), phaseVerificationProtocol.encode({
    phaseId: contract.id, role: contract.role, status: "not_applicable", checks: [],
    reason: "The current phase execution contract declares no required verification tasks.",
  }));
  if (!markdown.includes("<!-- hepha:phase-verification:json-v1 -->")) writeFileAtomic(phase.documentPath, `${markdown.trimEnd()}\n\n<!-- hepha:phase-verification:json-v1 -->\n`);
}
