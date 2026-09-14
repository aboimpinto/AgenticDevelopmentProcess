import type { WorkItemCard } from "@hepha/shared";
import type { freshVerificationEvidence } from "../../manual-test-verification/fresh-verification-state.js";

/** Derived current-run automated gates only; historical phase files and human review remain untouched. */
export function projectFreshPhaseEvidence(feature: WorkItemCard, fresh: ReturnType<typeof freshVerificationEvidence>): WorkItemCard {
  if (!fresh || fresh.error || !fresh.state.plan || !feature.implementationEvidence) return feature;
  const plan = fresh.state.plan;
  return { ...feature, implementationEvidence: { ...feature.implementationEvidence,
    phaseQualityGates: feature.implementationEvidence.phaseQualityGates.map(phase => {
      const ids = plan.phases.find(p => p.phaseNumber === phase.phaseNumber)?.checkIds ?? [];
      return { ...phase, gates: phase.gates.map(gate => {
        if (gate.gate !== "tests" && gate.gate !== "gherkin_e2e") return gate;
        // Fresh execution evidence does not change declared applicability.
        if (gate.status === "not_applicable" && gate.justification?.trim()) return gate;
        const kind = gate.gate;
        const checks = plan.checks.filter(c => ids.includes(c.id) && c.gates?.includes(kind));
        const reports = checks.map(c => fresh.evidence.find(e => e.title === c.id));
        if (!reports.length || reports.some(r => !r?.sourcePath)) return gate;
        return { ...gate, status: "satisfied" as const, evidencePaths: reports.map(r => r!.sourcePath!), justification: `Fresh run ${fresh.state.runId}: mapped automated checks executed and passed against unchanged source. Coverage and human acceptance remain separate.` };
      }) };
    }),
  } };
}
