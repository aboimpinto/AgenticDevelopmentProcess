import { readFileSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { sourceSnapshot, type FreshPlan } from "./fresh-verification-evidence.js";
import { VerificationPlanError } from "./fresh-verification-plan.js";
import { freshSnapshotExclusions, freshSourceFingerprint, type FreshVerificationState } from "./fresh-verification-state.js";

interface SourceChange { root: string; path: string; before?: string; after?: string }
interface SnapshotFiles { root: string; hash: string; files: Record<string, string> }

/** Hashes and filenames only; source contents never enter the recovery journal. */
export function captureVerificationSources(roots: string[], excluded: string[], directory: string) {
  const snapshots = roots.map(root => {
    const files: Record<string, string> = {};
    return { root, hash: sourceSnapshot(root, excluded, 0, files), files };
  });
  writeFileAtomic(resolve(directory, "source-snapshot-files.json"), JSON.stringify(snapshots));
  return snapshots.map(({ root, hash }) => ({ root, hash }));
}

export class VerificationSourceChanged extends Error {
  constructor(readonly changes: SourceChange[]) {
    super(`Source changed during verification: ${changes.slice(0, 20).map(c => `${basename(c.root)}/${c.path}`).join(", ")}`
      + (changes.length > 20 ? ` (and ${changes.length - 20} more files)` : ""));
  }
}

export function assertVerificationSources(folder: string, state: FreshVerificationState) {
  if (freshSourceFingerprint(folder) !== state.sourceFingerprint)
    throw new Error("Feature requirements changed during verification. Review the changed plan before retrying readiness.");
  const excluded = freshSnapshotExclusions(folder, state.directory, state.advisoryPaths);
  let before: SnapshotFiles[] = [];
  try { before = JSON.parse(readFileSync(resolve(state.directory, "source-snapshot-files.json"), "utf8")); } catch { /* Legacy states retain repository-level diagnosis. */ }
  const changes: SourceChange[] = [];
  for (const snapshot of state.snapshots ?? []) {
    const files: Record<string, string> = {};
    if (sourceSnapshot(snapshot.root, excluded, 0, files) === snapshot.hash) continue;
    const previous = before.find(s => s.root === snapshot.root && s.hash === snapshot.hash)?.files;
    if (!previous) { changes.push({ root: snapshot.root, path: "(repository contents)" }); continue; }
    for (const path of [...new Set([...Object.keys(previous), ...Object.keys(files)])].sort()) {
      if (previous[path] !== files[path]) changes.push({ root: snapshot.root, path: relative(snapshot.root, path), before: previous[path], after: files[path] });
    }
    // A filename/link-layout change can alter the aggregate even if leaf hashes match.
    if (!changes.some(c => c.root === snapshot.root)) changes.push({ root: snapshot.root, path: "(repository layout)" });
  }
  if (changes.length) throw new VerificationSourceChanged(changes);
}

/** A changed snapshot is never accepted by exclusion or an LLM verdict. Reinspect
 * and rerun in a new directory; two automatic retries bound unstable runners. */
export class VerificationSourceRecovery {
  private attempts: { runId: string; directory: string; changes: SourceChange[] }[] = [];
  private previousPlan?: FreshPlan;
  validate(plan: FreshPlan) {
    if (!this.previousPlan) return;
    const issues: string[] = [];
    for (const check of this.previousPlan.checks) {
      const next = plan.checks.find(c => c.id === check.id);
      if (!next || next.kind !== check.kind || check.gates?.some(g => !next.gates?.includes(g)))
        issues.push(`Source recovery must preserve check ${check.id}, its kind and gate obligations.`);
    }
    for (const phase of this.previousPlan.phases) {
      const next = plan.phases.find(p => p.phaseNumber === phase.phaseNumber);
      if (!next || phase.checkIds.some(id => !next.checkIds.includes(id))) issues.push(`Source recovery must preserve Phase ${phase.phaseNumber} check assignments.`);
    }
    if (issues.length) throw new VerificationPlanError(issues.join("\n"), "semantic", plan);
  }
  next(state: FreshVerificationState, failure: VerificationSourceChanged): string {
    this.previousPlan = state.plan;
    this.attempts.push({ runId: state.runId, directory: state.directory, changes: failure.changes });
    writeFileAtomic(resolve(state.directory, "source-recovery.json"), JSON.stringify({ schema: "verification-source-recovery/v1", attempts: this.attempts }));
    if (this.attempts.length >= 3) throw new Error(`${failure.message}. Verification could not reach a stable source state after 3 executions. `
      + this.attempts.map((attempt, index) => `Round ${index + 1}: the completed execution changed ${attempt.changes.map(c => `${basename(c.root)}/${c.path}`).slice(0, 20).join(", ")}.`).join(" ")
      + " Why recovery stopped: setup reinspection and two complete reruns still did not produce stable source fingerprints. Use Retry verification to start recovery again after reviewing concurrent edits or runner output configuration. "
      + "All attempt reports and the changed-file diagnosis are saved; human acknowledgements are preserved.");
    return ["Verification source recovery: the previous execution changed its source snapshot and its reports cannot certify this attempt.",
      `Read the diagnosis at ${resolve(state.directory, "source-recovery.json")} and the previous plan at ${resolve(state.directory, "inspection-selected.json")}.`,
      failure.message,
      "Inspect the changed files and the actual configured runners. Determine whether command ordering, generated output configuration or concurrent source edits explain the drift. Return a corrected verification plan using the existing JSON contract and inventory publication mechanism. Preserve all accepted obligations and checks; do not drop a check to obtain a stable fingerprint.",
      "Do not modify production/test code, requirements, human results or source snapshot records. Do not restore files, suppress generation or exclude files merely to hide a mismatch. Only use command/setup choices justified by current project configuration. HEPHA will establish a new baseline and rerun every selected check in a fresh output directory, then independently require stable source and valid reports.",
      this.attempts.length > 1 ? "Drift recurred after recovery. Diagnose the prior attempt before repeating it; report an actual unsupported setup or authority issue if no supported plan exists." : ""].join("\n");
  }
}
