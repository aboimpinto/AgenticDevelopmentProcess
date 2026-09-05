import type { PhaseSummary } from "@hepha/shared";
import {
  applyPhaseGateEvidenceHandoff,
  type PhaseGateEvidenceHandoff,
} from "../../phase-gate-evidence-handoff.js";

type NumberedPhase = PhaseSummary & { number: number };

export type PhaseGateEvidenceApplicationResult =
  | Readonly<{ kind: "satisfied" }>
  | Readonly<{ kind: "repair_required"; detail: string }>;

/** Persists worker-supplied gate evidence and returns only whether same-phase repair is required. */
export class PhaseGateEvidenceApplication {
  constructor(private readonly dependencies: {
    apply: typeof applyPhaseGateEvidenceHandoff;
    assertPassed: (handoff: PhaseGateEvidenceHandoff) => void;
    exists: (path: string) => boolean;
    parse: (output: string) => PhaseGateEvidenceHandoff;
    read: (path: string) => string;
    write: (path: string, markdown: string) => void;
  }) {}

  apply(input: {
    output: string;
    phase: NumberedPhase;
    phaseRef: string;
  }): PhaseGateEvidenceApplicationResult {
    const evidence = this.dependencies.parse(input.output);
    if (!this.dependencies.exists(input.phase.documentPath)) {
      throw new Error(`${input.phaseRef} worker returned gate evidence but its phase document is missing.`);
    }
    const markdown = this.dependencies.read(input.phase.documentPath);
    const updated = this.dependencies.apply(markdown, evidence);
    if (updated !== markdown) this.dependencies.write(input.phase.documentPath, updated);
    try {
      this.dependencies.assertPassed(evidence);
      return { kind: "satisfied" };
    } catch (error) {
      return {
        kind: "repair_required",
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
