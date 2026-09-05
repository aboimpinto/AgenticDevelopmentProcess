import type { FeaturePhaseQualitySummary, WorkItemCard } from "@hepha/shared";
import type { StoredProject } from "../../projects/stored-project.js";

export function countMissingPhaseQualityGates(feature: WorkItemCard): number {
  return (feature.implementationEvidence?.phaseQualityGates ?? []).reduce(
    (count, phase) => isResolvedPhaseQualitySummary(phase)
      ? count + phase.gates.filter((gate) => gate.status === "missing").length
      : count,
    0,
  );
}

export function getObservedPhaseChangedFiles(
  _project: Pick<StoredProject, "rootPath">,
  feature: WorkItemCard,
  phaseNumber: number,
): string[] {
  return (feature.implementationEvidence?.changedFiles ?? [])
    .filter((file) => file.phases.includes(phaseNumber))
    .map((file) => file.relativePath ?? file.path);
}

export function getPhaseQualityGates(feature: WorkItemCard, phaseNumber: number) {
  return (feature.implementationEvidence?.phaseQualityGates ?? [])
    .find((phase) => phase.phaseNumber === phaseNumber)
    ?.gates.map((gate) => ({ gate: gate.gate, status: gate.status })) ?? [];
}

export function getMissingPhaseQualityGates(feature: WorkItemCard, phaseNumber: number): string[] {
  return getPhaseQualityGates(feature, phaseNumber)
    .filter((gate) => gate.status === "missing")
    .map((gate) => gate.gate);
}

export function getFirstMissingPhaseQualityGate(feature: WorkItemCard) {
  for (const phase of feature.implementationEvidence?.phaseQualityGates ?? []) {
    if (!isResolvedPhaseQualitySummary(phase)) continue;
    const missingGates = phase.gates.filter((gate) => gate.status === "missing");
    if (missingGates.length > 0) {
      return {
        gates: missingGates.map((gate) => gate.gate),
        phaseNumber: phase.phaseNumber,
        phaseTitle: phase.phaseTitle,
      };
    }
  }
  return null;
}

export function isResolvedPhaseQualitySummary(phase: FeaturePhaseQualitySummary): boolean {
  const normalizedStatus = phase.phaseStatus.toUpperCase();
  return normalizedStatus === "COMPLETED" || normalizedStatus === "SKIPPED";
}
