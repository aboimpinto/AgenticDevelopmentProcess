import type { CompletionRecoveryResponse } from "@hepha/shared";
import type { CompletionReadinessRefreshApplication } from "./completion-readiness-refresh-application.js";
import type { FreshFeatureVerificationApplication } from "./fresh-feature-verification-application.js";

type RefreshInput = Parameters<CompletionReadinessRefreshApplication["refresh"]>[0];

/** User command only. Worker/background refreshes use the assessor directly. */
export class CompletionReadinessVerificationApplication {
  private readonly pending = new Set<string>();
  constructor(private readonly readiness: Pick<CompletionReadinessRefreshApplication, "refresh">,
    private readonly verification: Pick<FreshFeatureVerificationApplication, "verifyFeatureFromRefresh">) {}

  async refresh(input: RefreshInput & { verifyExisting?: boolean; verificationGuidance?: string }): Promise<CompletionRecoveryResponse> {
    if (input.verificationGuidance !== undefined && (!input.verifyExisting || typeof input.verificationGuidance !== "string" || input.verificationGuidance.length > 4000))
      throw new Error("Verification guidance requires an explicit verification refresh and at most 4000 characters.");
    if (input.verifyExisting !== undefined && (input.verifyExisting !== true || input.reassess !== true
      || input.confirm !== undefined || input.confirmProposalId !== undefined || input.coveragePhaseNumber !== undefined))
      throw new Error("Existing verification requires an explicit user refresh, separate from acceptance.");
    const key = JSON.stringify([input.projectId, input.cardId]);
    if (this.pending.has(key)) throw new Error("Readiness or its verification handoff is already running.");
    this.pending.add(key);
    try {
      const { verifyExisting, verificationGuidance, ...assessmentInput } = input;
      return verifyExisting
        ? await this.verification.verifyFeatureFromRefresh({ projectId: input.projectId, cardId: input.cardId, ...(verificationGuidance !== undefined ? { verificationGuidance } : {}) })
        : await this.readiness.refresh(assessmentInput);
    } finally { this.pending.delete(key); }
  }
}
