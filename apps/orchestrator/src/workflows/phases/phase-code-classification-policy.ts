import type { PhaseSummary } from "@hepha/shared";
import type { PhaseExecutionContractPhase } from "../../phase-execution-contract.js";
import { normalizeImplementationPhaseStatus } from "./phase-lifecycle-policy.js";

interface PhaseCodeClassificationPolicyDependencies {
  exists: (path: string) => boolean;
  read: (path: string) => string;
}

export class PhaseCodeClassificationPolicy {
  constructor(private readonly dependencies: PhaseCodeClassificationPolicyDependencies) {}

  hasCode(
    phase: PhaseSummary & { number: number },
    contract: PhaseExecutionContractPhase | null = null,
  ): boolean {
    if (normalizeImplementationPhaseStatus(phase.status) === "SKIPPED") return false;
    if (contract) {
      return contract.role === "implementation"
        || contract.role === "integration"
        || contract.role === "final_checkpoint";
    }
    if (/\b(health|planning|analysis|documentation|final|handoff)\b/i.test(phase.title)) return false;
    return !this.isExplicitlyDocumentationOnly(phase);
  }

  isExplicitlyDocumentationOnly(phase: PhaseSummary): boolean {
    const markdown = this.dependencies.exists(phase.documentPath)
      ? this.dependencies.read(phase.documentPath)
      : "";
    const text = `${phase.title}\n${phase.status}\n${markdown}`;
    return /\b(?:N\/A|not applicable)\b/i.test(text)
      && /\b(?:documentation-only|documentation rationale|no .*source|no .*runtime|no .*implementation|no .*behavior change|no .*behaviour change)\b/i.test(text);
  }
}
