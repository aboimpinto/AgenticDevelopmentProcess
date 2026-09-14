import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { canonicalCompatibilityStatus, readCompatibilityHeaderStatus, readCompatibilityProgress } from "./compatibility-lifecycle-state.js";

export interface RecoveryValidation {
  readonly valid: boolean;
  readonly errors: readonly { code: string; path: string; message: string }[];
}

/** Closed repair vocabulary: no inferred task, approval, gate or completion evidence. */
export function classifyCompatibilityRecovery(input: {
  folder: string; header: string | undefined; errors: RecoveryValidation["errors"];
  phaseCount: number; blocked: boolean; needsValidation: boolean; allowReadyMove: boolean;
}): "status" | "move" | null {
  if (input.needsValidation || input.blocked || input.phaseCount === 0) return null;
  const staleReady = canonicalCompatibilityStatus(input.header) === "READY_TO_DEVELOP" &&
    input.errors.length === 1 && input.errors[0]?.code === "INVALID_FEATURE_STATUS" && input.errors[0]?.path === "FeatureTasks.md";
  if (input.folder === "03_IN_PROGRESS" && staleReady) return "status";
  if (input.allowReadyMove && input.folder === "02_READY_TO_DEVELOP" && (staleReady ||
    (input.errors.length === 0 && canonicalCompatibilityStatus(input.header) === "IN_PROGRESS"))) return "move";
  return null;
}

/** Read-only admission shared by dashboard and execution; does not make artifacts valid. */
export function compatibilityRecoveryKind(feature: WorkItemCard, validation: RecoveryValidation, allowReadyMove = false) {
  if (validation.valid && feature.stateFolder !== "02_READY_TO_DEVELOP") return null;
  try {
    const progress = readCompatibilityProgress(feature);
    return classifyCompatibilityRecovery({ folder: feature.stateFolder,
      header: readCompatibilityHeaderStatus(readFileSync(resolve(feature.folderPath, "FeatureTasks.md"), "utf8")),
      errors: validation.errors, phaseCount: progress.phaseCount, blocked: progress.blocked,
      needsValidation: (feature.validation?.needsValidationCount ?? 0) > 0, allowReadyMove });
  } catch { return null; }
}
