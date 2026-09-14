import { isUnresolvedQualityGate, isPhaseQualityWarning, type FeaturePhaseQualitySummary } from "@hepha/shared";

export interface PhaseQualityBlocker {
  readonly gate: import("@hepha/shared").PhaseQualityResolutionInput["gate"];
  readonly phaseNumber: number | null;
  readonly phaseTitle: string;
  readonly title: string;
  readonly explanation: string;
  readonly recordedReason: string | null;
  readonly evidencePaths: readonly string[];
  readonly steps: readonly string[];
}

const labels = { build: "Build", lint: "Lint / typecheck", tests: "Automated tests", gherkin_e2e: "Gherkin / Playwright", code_review: "Code review" } as const;

/** Explain supplied gate facts; never infer a failed run from a missing evidence flag. */
export function buildPhaseQualityBlockers(phases: readonly FeaturePhaseQualitySummary[]): PhaseQualityBlocker[] {
  return buildPhaseQualityIssues(phases, false);
}

export function buildPhaseQualityWarnings(phases: readonly FeaturePhaseQualitySummary[]): PhaseQualityBlocker[] {
  return buildPhaseQualityIssues(phases, true);
}

function buildPhaseQualityIssues(phases: readonly FeaturePhaseQualitySummary[], warnings: boolean): PhaseQualityBlocker[] {
  return [...phases].sort((a, b) => (a.phaseNumber ?? Infinity) - (b.phaseNumber ?? Infinity)).flatMap(phase => {
    if (!["COMPLETED", "SKIPPED"].includes(phase.phaseStatus.trim().toUpperCase())) return [];
    return phase.gates.filter(warnings ? isPhaseQualityWarning : isUnresolvedQualityGate).map(gate => ({
      gate: gate.gate,
      phaseNumber: phase.phaseNumber, phaseTitle: phase.phaseTitle,
      title: `Phase ${phase.phaseNumber ?? "unknown"} — ${labels[gate.gate]}`,
      explanation: warnings ? "Non-blocking warning. The recorded outcome is preserved; you may choose whether to repair it." : gate.status === "waived" ? "Waiver has no recorded justification; the gate remains unresolved."
        : gate.status === "unknown" ? "Evidence status is unknown; successful verification has not been established."
        : gate.gate === "code_review" ? "Required review approval has not been established. Inspect the recorded verdict and evidence below."
        : gate.evidencePaths.some(path => path.endsWith(".verification.json")) ? "Recorded verification has not passed. Inspect the outcome and diagnostics below."
        : "Evidence missing or not recognised; this is not a recorded failure.",
      recordedReason: gate.justification, evidencePaths: gate.evidencePaths,
      steps: gate.gate === "code_review" ? [
        "If an existing review covers this phase and revision, verify its verdict and link the report in the phase quality evidence. Check nested review folders before requesting another review.",
        "If no applicable review exists, run a phase-scoped code review. If it requests changes, resolve the findings and obtain a new review before accepting the phase.",
      ] : gate.gate === "build" || gate.gate === "lint" ? [
        "Inspect the recorded command, exit status and diagnostics. A checkpoint verifies system health without requiring production-code changes.",
        "Resolve the reported errors or warnings, rerun the configured check and retain its execution evidence.",
      ] : [
        "If tests were already executed, verify and link the command, tested revision, non-zero test count and result in the phase quality evidence; repair missing references before rerunning work.",
        gate.gate === "gherkin_e2e"
          ? "Otherwise execute the applicable browser journeys against the required environment. Discovery alone is not execution. Record unavailable fixtures as blocked, not passed."
          : "Otherwise run the required phase tests. If a run fails, fix the reported defect and rerun it. Zero matching tests or tests not executed must remain unresolved.",
      ],
    }));
  });
}
