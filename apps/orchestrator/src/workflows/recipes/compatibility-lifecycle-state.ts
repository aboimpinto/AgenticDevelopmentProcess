import { compatibilityStatusDeclaration } from "./compatibility-status-declaration.js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { extractPhaseTaskLedger } from "../phases/phase-task-ledger.js";
import { getNumberedPhases, isImplementationPhaseResolved } from "../phases/phase-lifecycle-policy.js";

const featureStatuses: Readonly<Record<string, string>> = Object.freeze({
  READY_TO_DEVELOP: "READY_TO_DEVELOP", "02_READY_TO_DEVELOP": "READY_TO_DEVELOP",
  IN_PROGRESS: "IN_PROGRESS", "03_IN_PROGRESS": "IN_PROGRESS",
  COMPLETED: "COMPLETED", "04_COMPLETED": "COMPLETED",
});

/** Only declared compatibility aliases are accepted; a numeric prefix is not stripped generically. */
export function canonicalCompatibilityStatus(value: string | undefined): string | null {
  return value ? featureStatuses[value.toUpperCase()] ?? null : null;
}

/** Read only the header status token. A parenthesised note is descriptive, not lifecycle authority. */
export function readCompatibilityHeaderStatus(markdown: string): string | undefined {
  return compatibilityStatusDeclaration(markdown)?.value;
}

/** Runs only at an admitted execution boundary, after validation. Read-only scans never rewrite files. */
export function canonicalizeCompatibilityFeatureStatus(feature: WorkItemCard): void {
  const path = resolve(feature.folderPath, "FeatureTasks.md");
  const document = readFileSync(path, "utf8");
  const value = readCompatibilityHeaderStatus(document);
  const canonical = canonicalCompatibilityStatus(value);
  if (!canonical || canonical !== canonicalCompatibilityStatus(feature.stateFolder)) {
    throw new Error("COMPATIBILITY_STATE_CONFLICT: FeatureTasks status contradicts the lifecycle folder.");
  }
  const declaration = compatibilityStatusDeclaration(document)!;
  if (value !== canonical) writeFileSync(path, document.slice(0, declaration.offset) + canonical + document.slice(declaration.offset + declaration.length), "utf8");
}

export interface CompatibilityProgress {
  readonly folder: string;
  readonly resolved: ReadonlySet<number>;
  readonly completedTasks: ReadonlySet<string>;
  readonly phaseCount: number;
  readonly blocked: boolean;
}

/** Completion facts are captured before dispatch, so worker file changes cannot rewrite the baseline. */
export function readCompatibilityProgress(feature: WorkItemCard): CompatibilityProgress {
  const phases = getNumberedPhases(feature);
  return {
    folder: feature.stateFolder,
    phaseCount: phases.length,
    resolved: new Set(phases.filter(isImplementationPhaseResolved).map(p => p.number)),
    completedTasks: new Set(phases.flatMap(p => p.documentPath && existsSync(p.documentPath)
      ? extractPhaseTaskLedger(readFileSync(p.documentPath, "utf8"), p.number).filter(t => t.checked).map(t => t.id)
      : [])),
    blocked: phases.some(p => p.status?.toUpperCase() === "BLOCKED"),
  };
}

export function hasCompatibilityProgress(before: CompatibilityProgress, after: CompatibilityProgress): boolean {
  return (before.folder === "02_READY_TO_DEVELOP" && after.folder === "03_IN_PROGRESS") ||
    [...after.resolved].some(n => !before.resolved.has(n)) ||
    [...after.completedTasks].some(id => !before.completedTasks.has(id));
}
