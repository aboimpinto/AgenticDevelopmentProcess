import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { createHash } from "node:crypto";
import type { VerificationDiagnosis } from "@hepha/shared";
import { writeFileAtomic } from "./artifact-storage.js";
import { recoveryFingerprint } from "./acceptance-coverage-reconciliation.js";
import { discoverVerificationTargets } from "./configured-verification-targets.js";
import { validateVerificationDiagnosis } from "./verification-diagnosis.js";
import { stripCompletionRecoverySection } from "../memorybank/completion-recovery-section.js";

export const VERIFICATION_DIAGNOSIS_MARKER = "HEPHA_VERIFICATION_DIAGNOSIS_V1";
export const verificationDiagnosisHandoff = `At the end return one single-line ${VERIFICATION_DIAGNOSIS_MARKER} {"findings":[{"sourceId":"an exact selected criterion ID","diagnosis":{"kind":"implementation_missing|execution_missing|environment_blocked|evidence_missing|investigation_required","explanation":"what was established after inspecting context and delegation","references":["exact phase/source/report references"],"nextAction":"the precise in-scope repair or prerequisite needed"}}]}. Include each remaining finding; use an empty findings array only if none remain. This is a diagnosis, not test execution evidence, approval or authority to perform the next action. Missing or invalid handoff cannot establish success. Reuse existing test identities and do not regenerate passing tests.`;

interface WorkerDiagnosisRecord {
  mode: "execution" | "investigation" | "repair";
  guidanceFingerprint: string;
  runId: string; phaseNumber: number; sourceFingerprint: string; configurationFingerprint: string;
  findings: { sourceId: string; diagnosis: VerificationDiagnosis }[];
  referenceFingerprint: string;
}
function referenceFingerprint(folder: string, projectRoot: string, findings: WorkerDiagnosisRecord["findings"]) {
  const roots = [...new Set([folder, projectRoot].map(root => realpathSync(root)))];
  const bindings = findings.flatMap(finding => finding.diagnosis.references).map(reference => {
    const filename = reference.replace(/:\d+(?::\d+)?(?:-\d+)?$/, "").replace(/#.*$/, "");
    // Hash inspected local source/report files only, never execute or publish their contents.
    if (!/\.(?:[cm]?[jt]sx?|md|json|cs|rs|py|ya?ml|feature|sh|toml|xml|trx)$/i.test(filename)) return [reference, null];
    const candidates = roots.map(root => resolve(root, filename));
    const bindings = candidates.map(path => {
      if (!existsSync(path)) return null;
      const real = realpathSync(path);
      if (!roots.some(root => { const part = relative(root, real); return !isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`); })) return null;
      const stat = statSync(real);
      if (!stat.isFile() || stat.size > 2_000_000) return null;
      const content = readFileSync(real);
      return createHash("sha256").update(/\.md$/i.test(real) ? stripCompletionRecoverySection(content.toString("utf8")) : content).digest("hex");
    });
    return [reference, bindings];
  });
  return createHash("sha256").update(JSON.stringify(bindings)).digest("hex");
}
const pathFor = (folder: string) => resolve(folder, "manual-test-verification", "verification-diagnoses.json");
function readRecords(folder: string): WorkerDiagnosisRecord[] {
  if (!existsSync(pathFor(folder))) return [];
  const text = readFileSync(pathFor(folder), "utf8");
  if (text.length > 2_000_000) throw new Error("Verification diagnosis history exceeds its limit; inspect recovery artifacts.");
  const records = JSON.parse(text) as WorkerDiagnosisRecord[];
  if (!Array.isArray(records) || records.length > 100) throw new Error("Invalid verification diagnosis history.");
  for (const record of records) {
    if (!record || typeof record.runId !== "string" || !Number.isSafeInteger(record.phaseNumber) || typeof record.sourceFingerprint !== "string" || typeof record.configurationFingerprint !== "string" || !Array.isArray(record.findings) || record.findings.length > 100) throw new Error("Invalid verification diagnosis record.");
    for (const finding of record.findings) {
      if (typeof finding?.sourceId !== "string") throw new Error("Invalid verification diagnosis source.");
      validateVerificationDiagnosis(finding.diagnosis);
    }
  }
  return records;
}

/** Only the orchestrator publishes a completed, still-owned invocation's handoff.
 * No model-supplied paths, run IDs or phase ownership are used for persistence. */
export function recordWorkerDiagnosis(input: { folder: string; projectRoot: string; phaseNumber: number; runId: string; sourceIds: string[]; output: string; mode?: WorkerDiagnosisRecord["mode"]; note?: string }) {
  if (!input.sourceIds.length) return;
  const lines = input.output.split("\n").filter(line => line.startsWith(`${VERIFICATION_DIAGNOSIS_MARKER} `));
  if (lines.length > 1 || (lines[0]?.length ?? 0) > 100_000) throw new Error("Invalid verification diagnosis handoff: expected one bounded receipt.");
  let findings: WorkerDiagnosisRecord["findings"];
  if (!lines.length) {
    findings = input.sourceIds.map(sourceId => ({ sourceId, diagnosis: { kind: "investigation_required", explanation: "The worker returned without a structured verification diagnosis. Its response does not establish that the missing verification is ready to run.", references: [`workflow:${input.runId}`], nextAction: "Inspect this attempt's reports and source context, then publish the exact remaining finding. Do not repeat execution or implement tests solely because the handoff is missing." } }));
  } else {
    const value = JSON.parse(lines[0]!.slice(VERIFICATION_DIAGNOSIS_MARKER.length + 1));
    if (!Array.isArray(value?.findings) || value.findings.length > 100) throw new Error("Invalid verification diagnosis findings.");
    const seen = new Set<string>();
    findings = value.findings.map((finding: { sourceId: string; diagnosis: unknown }) => {
      if (!input.sourceIds.includes(finding?.sourceId) || seen.has(finding.sourceId)) throw new Error("Verification diagnosis must cite unique criteria from this phase's selected action.");
      seen.add(finding.sourceId);
      return { sourceId: finding.sourceId, diagnosis: validateVerificationDiagnosis(finding.diagnosis) };
    });
  }
  const records = readRecords(input.folder);
  // Retain the latest outcome per phase. Invocation telemetry owns full history.
  const next = records.filter(record => record.phaseNumber !== input.phaseNumber);
  next.push({ runId: input.runId, mode: input.mode ?? "execution", phaseNumber: input.phaseNumber, sourceFingerprint: recoveryFingerprint(input.folder), configurationFingerprint: discoverVerificationTargets(input.projectRoot, input.folder).fingerprint,
    guidanceFingerprint: createHash("sha256").update(input.note?.trim() ?? "").digest("hex"),
    referenceFingerprint: referenceFingerprint(input.folder, input.projectRoot, findings), findings });
  writeFileAtomic(pathFor(input.folder), JSON.stringify(next, null, 2));
}

export function currentWorkerDiagnoses(folder: string, projectRoot: string) {
  const source = recoveryFingerprint(folder), configuration = discoverVerificationTargets(projectRoot, folder).fingerprint;
  const records = readRecords(folder).filter(record => record.sourceFingerprint === source && record.configurationFingerprint === configuration
    && record.referenceFingerprint === referenceFingerprint(folder, projectRoot, record.findings));
  return { findings: records.flatMap(record => record.findings), records, fingerprint: createHash("sha256").update(JSON.stringify(records.map(({ runId: _runId, ...record }) => record))).digest("hex") };
}

export function assertVerificationRetry(input: { folder: string; projectRoot: string; phaseNumber: number; mode: WorkerDiagnosisRecord["mode"]; note: string }) {
  // An explicit acknowledgement may retry environment preflight; it never counts
  // as availability or proof. Inspection/repair with unchanged findings needs a
  // relevant source/configuration change or new human guidance, not another loop.
  if (input.mode === "execution") return;
  const previous = currentWorkerDiagnoses(input.folder, input.projectRoot).records.find(record => record.phaseNumber === input.phaseNumber && record.mode === input.mode && record.findings.length);
  const guidance = createHash("sha256").update(input.note.trim()).digest("hex");
  if (previous && (!input.note.trim() || previous.guidanceFingerprint === guidance)) throw new Error(`The previous ${input.mode} reported the same unresolved finding and its cited sources/configuration are unchanged. ${previous.findings[0]!.diagnosis.nextAction} Provide new repair guidance or update the prerequisite before retrying.`);
}
