import { resolve } from "node:path";
import { parseFreshVerificationPlan, sourceSnapshot } from "./fresh-verification-evidence.js";
import { freshSnapshotExclusions, freshSourceFingerprint, type FreshVerificationState } from "./fresh-verification-state.js";
import { readRecoveryExecutionEvidence } from "./recovery-execution-evidence.js";
import { verificationPlanSourceRoots } from "./verification-source-roots.js";

/** Explicit Refresh can finish an interrupted validation without re-executing
 * checks. No failed, stale, incomplete or merely historical report is promoted. */
export function resumableVerification(state: FreshVerificationState | null, root: string, folder: string,
  featureId: string, phases: number[]): FreshVerificationState | null {
  if (!state || state.status !== "blocked" || state.stage !== "validating" || state.featureId !== featureId
    || !state.plan || !state.snapshots?.length || !/^workflow-[\w-]+$/.test(state.runId)
    || resolve(state.directory) !== resolve(root, ".hepha/verification-runs", state.runId)) return null;
  try {
    const plan = parseFreshVerificationPlan(JSON.stringify(state.plan), phases);
    const roots = [...new Set([root, ...verificationPlanSourceRoots(plan)])];
    if (roots.length !== state.snapshots.length || roots.some(owner => !state.snapshots!.some(s => s.root === owner))) return null;
    if (freshSourceFingerprint(folder) !== state.sourceFingerprint || state.snapshots.some(s =>
      sourceSnapshot(s.root, freshSnapshotExclusions(folder, state.directory, state.advisoryPaths)) !== s.hash)) return null;
    const imported = readRecoveryExecutionEvidence(folder, root, featureId,
      { directory: state.directory, runId: state.runId, startedAt: state.startedAt, checks: plan.checks });
    return imported.diagnostics.length ? null : state;
  } catch { return null; }
}
