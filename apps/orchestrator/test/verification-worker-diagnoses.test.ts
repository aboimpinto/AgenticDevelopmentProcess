import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { assertVerificationRetry, recordWorkerDiagnosis, currentWorkerDiagnoses } from "../src/manual-test-verification/verification-worker-diagnoses.js";

const diagnosis = { kind: "implementation_missing", explanation: "Shared helper does not implement the approved operation.", references: ["helper.ts:1"], nextAction: "Repair the helper within the owning phase and verify its callers." };
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), "hepha-diagnosis-"));
  writeFileSync(join(folder, "phase.md"), "# Verification\n");
  writeFileSync(join(folder, "helper.ts"), "export const setup = () => {};\n");
  return { folder, input: { folder, projectRoot: folder, phaseNumber: 8, runId: "run", sourceIds: ["AC-STORE"], output: `HEPHA_VERIFICATION_DIAGNOSIS_V1 ${JSON.stringify({ findings: [{ sourceId: "AC-STORE", diagnosis }] })}` }, close: () => rmSync(folder, { recursive: true, force: true }) };
}
it("invalidates a diagnosis when the cited implementation changes, even if phase prose and runner configuration do not", () => {
  const f = fixture(); try {
    recordWorkerDiagnosis(f.input); expect(currentWorkerDiagnoses(f.folder, f.folder).findings).toHaveLength(1);
    writeFileSync(join(f.folder, "helper.ts"), "export const setup = () => 'implemented';\n");
    expect(currentWorkerDiagnoses(f.folder, f.folder).findings).toEqual([]);
  } finally { f.close(); }
});
it("records missing handoff as investigation, never success or an inferred code repair", () => {
  const f = fixture(); try {
    recordWorkerDiagnosis({ ...f.input, output: "All done" });
    expect(currentWorkerDiagnoses(f.folder, f.folder).findings[0]?.diagnosis.kind).toBe("investigation_required");
  } finally { f.close(); }
});
it("rejects unrelated criterion IDs and uncited implementation claims", () => {
  const f = fixture(); try {
    for (const finding of [{ sourceId: "OTHER", diagnosis }, { sourceId: "AC-STORE", diagnosis: { ...diagnosis, references: [] } }]) {
      expect(() => recordWorkerDiagnosis({ ...f.input, output: `HEPHA_VERIFICATION_DIAGNOSIS_V1 ${JSON.stringify({ findings: [finding] })}` })).toThrow();
    }
    expect(currentWorkerDiagnoses(f.folder, f.folder).findings).toEqual([]);
  } finally { f.close(); }
});
it("replaces the prior phase diagnosis with a new outcome without creating coverage proof", () => {
  const f = fixture(); try {
    recordWorkerDiagnosis(f.input);
    recordWorkerDiagnosis({ ...f.input, runId: "next-run", output: 'HEPHA_VERIFICATION_DIAGNOSIS_V1 {"findings":[]}' });
    expect(currentWorkerDiagnoses(f.folder, f.folder).findings).toEqual([]);
  } finally { f.close(); }
});
it("blocks unchanged repair loops but permits a different action, changed source or new human guidance", () => {
  const f = fixture(); try {
    recordWorkerDiagnosis({ ...f.input, mode: "repair" });
    const retry = { folder: f.folder, projectRoot: f.folder, phaseNumber: 8, mode: "repair" as const, note: "" };
    expect(() => assertVerificationRetry(retry)).toThrow("unchanged");
    expect(() => assertVerificationRetry({ ...retry, mode: "investigation" })).not.toThrow();
    expect(() => assertVerificationRetry({ ...retry, note: "The documented fixture setup is now available; inspect that procedure first." })).not.toThrow();
    writeFileSync(join(f.folder, "helper.ts"), "export const setup = () => 'fixed';\n");
    expect(() => assertVerificationRetry(retry)).not.toThrow();
  } finally { f.close(); }
});
it("keeps unchanged diagnoses stable across repeated attempts instead of invalidating all evidence with a new run ID", () => {
  const f = fixture(); try {
    recordWorkerDiagnosis(f.input);
    const fingerprint = currentWorkerDiagnoses(f.folder, f.folder).fingerprint;
    recordWorkerDiagnosis({ ...f.input, runId: "retry" });
    expect(currentWorkerDiagnoses(f.folder, f.folder).fingerprint).toBe(fingerprint);
  } finally { f.close(); }
});
