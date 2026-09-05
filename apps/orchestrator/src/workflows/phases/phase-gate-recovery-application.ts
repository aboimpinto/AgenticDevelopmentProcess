import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { PhaseGateEvidenceHandoff } from "../../phase-gate-evidence-handoff.js";
import {
  applyPhaseGateEvidenceHandoff,
  reconcileGherkinE2eGateFromRecordedEvidence,
} from "../../phase-gate-evidence-handoff.js";
import type { StoredProject } from "../../projects/stored-project.js";

type NumberedPhase = PhaseSummary & { number: number };

export class PhaseGateRecoveryApplication {
  constructor(private readonly dependencies: {
    findSessionEvidence: (feature: WorkItemCard, phase: NumberedPhase) => PhaseGateEvidenceHandoff | null;
    getMissingGates: (feature: WorkItemCard, phaseNumber: number) => string[];
    hasCheckedTaskLedger: (phase: PhaseSummary) => boolean;
    orderPhases: (feature: WorkItemCard) => readonly NumberedPhase[];
    refreshFeature: (project: StoredProject, externalId: string, fallback: WorkItemCard) => Promise<WorkItemCard>;
  }) {}

  async recoverPersistedWorkerEvidence(project: StoredProject, feature: WorkItemCard): Promise<WorkItemCard> {
    for (const phase of this.dependencies.orderPhases(feature)) {
      if (!this.dependencies.hasCheckedTaskLedger(phase)
        || !hasMissingPhaseGateRow(phase, "Changed files")
        || !this.dependencies.getMissingGates(feature, phase.number).includes("tests")) continue;
      const handoff = this.dependencies.findSessionEvidence(feature, phase);
      if (!handoff || !existsSync(phase.documentPath)) continue;
      const markdown = readFileSync(phase.documentPath, "utf8");
      const updated = applyPhaseGateEvidenceHandoff(markdown, handoff);
      if (updated === markdown) continue;
      writeFileSync(phase.documentPath, updated, "utf8");
      return this.dependencies.refreshFeature(project, feature.externalId, feature);
    }
    return feature;
  }

  async reconcileRecordedGherkin(project: StoredProject, feature: WorkItemCard): Promise<WorkItemCard> {
    let changed = false;
    for (const phase of this.dependencies.orderPhases(feature)) {
      if (!isFile(phase.documentPath)) continue;
      const markdown = readFileSync(phase.documentPath, "utf8");
      const updated = reconcileGherkinE2eGateFromRecordedEvidence(markdown);
      if (updated === markdown) continue;
      writeFileSync(phase.documentPath, updated, "utf8");
      changed = true;
    }
    return changed ? this.dependencies.refreshFeature(project, feature.externalId, feature) : feature;
  }
}

export function hasMissingPhaseGateRow(phase: Pick<PhaseSummary, "documentPath">, label: string): boolean {
  if (!isFile(phase.documentPath)) return false;
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^\\|\\s*${escapedLabel}\\s*\\|\\s*missing\\s*\\|`, "im").test(readFileSync(phase.documentPath, "utf8"));
}

function isFile(path: string): boolean {
  try { return existsSync(path) && statSync(path).isFile(); } catch { return false; }
}
