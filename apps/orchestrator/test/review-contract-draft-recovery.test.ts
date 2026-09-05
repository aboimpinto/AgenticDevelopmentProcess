import { describe, expect, it } from "vitest";
import {
  recoverReviewContractDraft,
  shouldRepairReviewContractRejection,
} from "../src/review-contract-draft-recovery.js";

describe("review-contract draft recovery policy", () => {
  it("repairs and revalidates a schema-invalid draft in the same run", async () => {
    const rejectedDraft = JSON.stringify({
      scope: { featureId: "feat-068-full-feature-name" },
      findings: [{ authority: { reference: "ac:feat-068:criterion-1" } }],
    });
    const correctedDraft = rejectedDraft.replace("ac:feat-068:", "ac:feat-068-full-feature-name:");
    const validated = { state: "V1_VALIDATED" as const, result: "NEEDS_CHANGES" as const };
    const repairs: string[] = [];

    const result = await recoverReviewContractDraft({
      initialDraft: rejectedDraft,
      validate: (draft) => draft === correctedDraft
        ? { kind: "validated", value: validated }
        : { kind: "rejected", code: "ambiguous_rule_reference", message: "Rule reference format is ambiguous or invalid." },
      repair: async ({ draft }) => {
        repairs.push(draft);
        return correctedDraft;
      },
    });

    expect(result).toEqual({
      kind: "validated",
      value: validated,
      draft: correctedDraft,
      repairAttempts: 1,
    });
    expect(repairs).toEqual([rejectedDraft]);
  });

  it("stops when a repair returns the same rejected draft", async () => {
    let repairCalls = 0;
    const result = await recoverReviewContractDraft({
      initialDraft: "{ invalid contract }",
      validate: () => ({ kind: "rejected", code: "invalid_shape", message: "Invalid shape." }),
      repair: async ({ draft }) => {
        repairCalls += 1;
        return draft;
      },
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: "no_progress",
      repairAttempts: 1,
    });
    expect(repairCalls).toBe(1);
  });

  it("does not send unsafe or oversized content to a repair worker", async () => {
    expect(shouldRepairReviewContractRejection("unsafe_content")).toBe(false);
    expect(shouldRepairReviewContractRejection("size_limit_exceeded")).toBe(false);

    let repairCalls = 0;
    const result = await recoverReviewContractDraft({
      initialDraft: "unsafe draft",
      validate: () => ({ kind: "rejected", code: "unsafe_content", message: "Unsafe content." }),
      repair: async () => {
        repairCalls += 1;
        return "must not run";
      },
    });

    expect(result).toMatchObject({ kind: "rejected", reason: "not_repairable", repairAttempts: 0 });
    expect(repairCalls).toBe(0);
  });
});
