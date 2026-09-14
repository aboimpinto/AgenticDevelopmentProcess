import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { writeFileAtomic } from "./artifact-storage.js";
import { parseFreshVerificationPlan } from "./fresh-verification-plan.js";
import { verificationPlanSourceRoots } from "./verification-source-roots.js";
import { regularJson, sha256, sourceSnapshot, type FreshPlan } from "./fresh-verification-evidence.js";

interface BaselineInput {
  root: string; folder: string; featureId: string; runId: string; directory: string;
  sourceFingerprint: string; contractHash: string; phases: number[]; contextRoots: string[];
}
const pathFor = (input: BaselineInput) => resolve(input.folder, "manual-test-verification", "inspection-baseline.json");
const exclusions = (input: BaselineInput) => [resolve(input.folder), resolve(input.root, ".hepha", "verification-runs")];
const rootsFor = (input: BaselineInput, plan: FreshPlan) => [...new Set([input.root, ...input.contextRoots, ...verificationPlanSourceRoots(plan)].map(root => realpathSync(root)))].sort();
const ownedDirectory = (input: BaselineInput, runId: string, directory: string) => typeof runId === "string" && /^[\w-]+$/.test(runId)
  && directory === resolve(input.root, ".hepha", "verification-runs", runId);

/** Reusable configuration only. Never read, copy or certify a previous report.
 * Conservative whole-repository hashes include dirty and newly added source in
 * every bound repository. Any drift returns to inspection, not cached evidence.
 */
export function saveVerificationPlanBaseline(input: BaselineInput, candidate: FreshPlan) {
  if (!ownedDirectory(input, input.runId, input.directory)) throw new Error("Invalid inspection baseline run directory.");
  const plan = parseFreshVerificationPlan(JSON.stringify(candidate), input.phases);
  const snapshots = rootsFor(input, plan).map(root => ({ root, hash: sourceSnapshot(root, exclusions(input)) }));
  writeFileAtomic(pathFor(input), JSON.stringify({ schema: "verification-plan-baseline/v1", featureId: input.featureId,
    contractHash: input.contractHash, sourceFingerprint: input.sourceFingerprint, runId: input.runId, directory: input.directory,
    plan, planHash: sha256(JSON.stringify(plan)), snapshots }));
}

export function reuseVerificationPlanBaseline(input: BaselineInput): (FreshPlan & { reusedFromRunId: string }) | null {
  try {
    const saved = regularJson(pathFor(input));
    if (saved.schema !== "verification-plan-baseline/v1" || saved.featureId !== input.featureId
      || saved.contractHash !== input.contractHash || saved.sourceFingerprint !== input.sourceFingerprint
      || !ownedDirectory(input, saved.runId, saved.directory) || !ownedDirectory(input, input.runId, input.directory)
      || !saved.plan || saved.planHash !== sha256(JSON.stringify(saved.plan)) || !Array.isArray(saved.snapshots)) return null;
    const plan = parseFreshVerificationPlan(JSON.stringify(saved.plan), input.phases);
    const roots = rootsFor(input, plan);
    if (saved.snapshots.length !== roots.length || saved.snapshots.some((s: { root: string; hash: string }, index: number) =>
      s.root !== roots[index] || s.hash !== sourceSnapshot(s.root, exclusions(input)))) return null;
    // Rebind the owned invocation envelope, preserving command selection and all
    // scope obligations. Walk strings instead of replacing JSON escape sequences.
    const rebind = (value: unknown): unknown => {
      if (typeof value === "string") return value.split(saved.directory).join(input.directory).split(saved.runId).join(input.runId);
      if (Array.isArray(value)) return value.map(rebind);
      if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, rebind(v)]));
      return value;
    };
    return { ...parseFreshVerificationPlan(JSON.stringify(rebind(plan)), input.phases), reusedFromRunId: saved.runId };
  } catch { return null; } // Stale, corrupt or unbound configuration must be inspected again.
}
