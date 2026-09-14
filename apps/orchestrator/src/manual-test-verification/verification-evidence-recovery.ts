import { lstatSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { VerificationRecoveryProgress } from "./verification-recovery-progress.js";
import { recoverableVerificationWorkerFailure } from "./verification-worker-recovery.js";

/** Validation, not an agent's completion text or changed audit metadata, decides
 * progress. Repeated/cycling diagnostics require diagnosis before escalation. */
export async function recoverVerificationEvidence(input: {
  directory: string;
  initialWorkerFailure?: string;
  owned: () => Promise<boolean>;
  assertFresh: () => void;
  validate: () => string[];
  repairing: (attempt: number, diagnostics: string[]) => Promise<void>;
  repair: (diagnostics: string[], auditPath: string, repeated: boolean) => Promise<string>;
}): Promise<boolean> {
  const progress = new VerificationRecoveryProgress();
  let attempt = 0, previousResponse: string | undefined;
  let workerFailure = input.initialWorkerFailure;
  while (await input.owned()) {
    // These guards are outside the recoverable importer boundary. An agent may
    // repair evidence, but cannot certify changed source using the old baseline.
    input.assertFresh();
    let diagnostics: string[];
    try { diagnostics = input.validate(); }
    catch (error) { diagnostics = [error instanceof Error ? error.message : String(error)]; }
    if (workerFailure) diagnostics = [...diagnostics, `Verification worker failed: ${workerFailure}`];
    if (!await input.owned()) return false;
    if (!diagnostics.length) return true;
    const { occurrences, repeated, exhausted } = progress.observe(diagnostics);
    const auditPath = resolve(input.directory, `evidence-recovery-${++attempt}.json`);
    const audit = { schema: "verification-evidence-recovery/v1", attempt, diagnostics,
      occurrences, receipt: receiptSnapshot(input.directory), previousResponse };
    writeFileAtomic(auditPath, JSON.stringify(audit));
    if (exhausted) throw new Error(`Verification evidence recovery made no validation progress after repeated attempts. `
      + `Inspect ${auditPath} for the attempts and diagnosis; resolve the remaining evidence, setup or authority issue.\n${diagnostics.join("\n")}`
      + (previousResponse ? `\nLast agent diagnosis: ${previousResponse.slice(0, 4000)}` : ""));
    await input.repairing(attempt, diagnostics);
    if (!await input.owned()) return false;
    try {
      previousResponse = (await input.repair(diagnostics, auditPath, repeated)).slice(0, 16_000);
      workerFailure = undefined;
    } catch (error) {
      if (!await input.owned()) return false;
      const reason = recoverableVerificationWorkerFailure(error);
      if (reason === null) throw error;
      workerFailure = reason;
      previousResponse = `Correction worker failed: ${reason}`;
    }
    if (await input.owned()) writeFileAtomic(auditPath, JSON.stringify({ ...audit, response: previousResponse }));
  }
  return false;
}

function receiptSnapshot(directory: string): string | null {
  try {
    const path = resolve(directory, "receipt.json"), stat = lstatSync(path);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= 1_000_000 ? readFileSync(path, "utf8") : null;
  } catch { return null; }
}
