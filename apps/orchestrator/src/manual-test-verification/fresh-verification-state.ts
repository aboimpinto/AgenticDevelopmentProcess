import { existsSync } from "node:fs";
import type { CompletionRecoveryAssessment } from "@hepha/shared";
import { resolve } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { regularJson, sha256, sourceSnapshot, type FreshPlan } from "./fresh-verification-evidence.js";
import { readRecoveryExecutionEvidence } from "./recovery-execution-evidence.js";
import { readFeatureDocuments } from "./steered-pack-preparation.js";
import type { ManualTestDeliveryModel } from "./delivery-model.js";

export const freshVerificationSourceChanged = "Source changed since fresh verification. Refresh to verify the current code; prior results remain historical.";

export interface FreshVerificationState {
  schema: "fresh-feature-verification/v1"; runId: string; featureId: string; startedAt: string;
  status: "inspecting" | "executing" | "passed" | "blocked";
  directory: string; sourceFingerprint: string; error?: string; plan?: FreshPlan;
  advisoryPaths?: string[];
  snapshots?: { root: string; hash: string }[];
  inspectionSourceHash?: string;
  previousInspectionCheckpoint?: string;
  reusedPlanFromRunId?: string;
  correction?: { attempt: number; kind: "format" | "semantic"; reason: string; startedAt: string };
  stage?: CompletionRecoveryAssessment["verificationStage"];
  activeCheckId?: string;
}
export const freshStatePath = (folder: string) => resolve(folder, "manual-test-verification", "fresh-verification.json");
export const freshSourceFingerprint = (folder: string) => readFeatureDocuments(folder, "acceptance coverage evidence").split("\n")[0]!;
export function readFreshState(folder: string): FreshVerificationState | null {
  if (!existsSync(freshStatePath(folder))) return null;
  const state = regularJson(freshStatePath(folder));
  if (state.schema !== "fresh-feature-verification/v1" || typeof state.runId !== "string" || typeof state.directory !== "string" || !["inspecting", "executing", "passed", "blocked"].includes(state.status)) throw new Error("Invalid fresh verification state; restore it before refreshing.");
  return state;
}
export function saveFreshState(folder: string, state: FreshVerificationState) {
  writeFileAtomic(freshStatePath(folder), JSON.stringify(state, null, 2));
}
export function freshSnapshotExclusions(folder: string, directory: string, advisoryPaths: readonly string[] = []) {
  // Feature documents have a separate semantic fingerprint that excludes generated recovery sections.
  return [resolve(folder), resolve(directory, ".."), ...advisoryPaths];
}
export function freshVerificationEvidence(folder: string) {
  const state = readFreshState(folder);
  if (!state) return null;
  try {
    if (state.status !== "passed") {
      const correction = state.stage === "correcting" && state.correction
        ? ` Correcting ${state.correction.kind} plan error (attempt ${state.correction.attempt}, ${Math.max(0, Math.floor((Date.now() - Date.parse(state.correction.startedAt)) / 1000))}s elapsed): ${state.correction.reason}` : "";
      throw new Error(state.error ?? `Fresh feature verification is ${state.status}.${correction} Historical reports cannot certify this refresh.`);
    }
    if (!state.plan || !state.snapshots?.length) throw new Error("Fresh verification scope or source snapshots are missing.");
    if (freshSourceFingerprint(folder) !== state.sourceFingerprint || state.snapshots.some(s => sourceSnapshot(s.root, freshSnapshotExclusions(folder, state.directory, state.advisoryPaths)) !== s.hash))
      throw new Error(freshVerificationSourceChanged);
    const imported = readRecoveryExecutionEvidence(folder, state.snapshots[0]!.root, state.featureId, { directory: state.directory, runId: state.runId, startedAt: state.startedAt, checks: state.plan.checks });
    return { ...imported, error: imported.diagnostics.length ? imported.diagnostics.join("\n") : undefined, state };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { state, evidence: [], error: message, fingerprint: sha256(JSON.stringify([state.runId, message])) };
  }
}
/** Readiness-only override: never changes the canonical manual package hash or saved human results. */
export function verificationCoverageScope(folder: string, model: ManualTestDeliveryModel) {
  const entries = model.acceptedScope ? model.coverageMap.filter(e => model.acceptedScope!.criteria.some(c => c.sourceId === e.sourceId)) : model.coverageMap;
  return readFreshState(folder) ? entries.filter(entry => entry.category.endsWith("-ac") || entry.coverageStatus === "uncovered")
    : entries.filter(entry => entry.coverageStatus === "uncovered");
}
