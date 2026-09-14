import { lstatSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { parseFreshVerificationPlan, regularJson, within } from "./fresh-verification-evidence.js";
import type { FreshVerificationState } from "./fresh-verification-state.js";

/** Partial inspection is reusable navigation, never evidence or executable authority.
 * The next worker must re-read selected test/configuration sources (including
 * linked repositories), finish all phases and return a fully validated plan.
 */
export function reusableInspectionCheckpoint(previous: FreshVerificationState | null, root: string,
  featureId: string, sourceFingerprint: string, sourceHash: string, phaseNumbers: number[]): string | undefined {
  if (!previous || previous.status !== "blocked" || !previous.error?.includes("HEPHA_INPUT_USAGE_BUDGET_EXCEEDED")
    || previous.featureId !== featureId || previous.sourceFingerprint !== sourceFingerprint || previous.inspectionSourceHash !== sourceHash) return;
  try {
    const base = resolve(root, ".hepha", "verification-runs");
    const path = resolve(previous.directory, "inspection-checkpoint.json");
    if (!within(base, path) || !within(realpathSync(base), realpathSync(path)) || lstatSync(path).size > 128_000) return;
    const checkpoint = regularJson(path);
    if (checkpoint.schema !== "feature-inspection-checkpoint/v1" || checkpoint.runId !== previous.runId || checkpoint.featureId !== featureId
      || !Array.isArray(checkpoint.phases) || !checkpoint.phases.length || !Array.isArray(checkpoint.remainingPhaseNumbers)) return;
    const inspected = checkpoint.phases.map((p: { phaseNumber: number }) => p.phaseNumber);
    const all = [...inspected, ...checkpoint.remainingPhaseNumbers];
    if (all.length !== phaseNumbers.length || new Set(all).size !== all.length || all.some(n => !phaseNumbers.includes(n))) return;
    parseFreshVerificationPlan(JSON.stringify({ checks: checkpoint.checks, phases: checkpoint.phases }), inspected);
    return path;
  } catch { return; } // Malformed/stale partial work is ignored, never promoted to a pass.
}
