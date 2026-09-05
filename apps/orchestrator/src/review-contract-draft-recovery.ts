import type { ReviewContractRejectionCode } from "./review-contract-types.js";

export const DEFAULT_REVIEW_CONTRACT_REPAIR_ATTEMPTS = 5;

const REPAIRABLE_REJECTION_CODES = new Set<ReviewContractRejectionCode>([
  "invalid_shape",
  "unsupported_schema_version",
  "unknown_rule",
  "inactive_rule",
  "ambiguous_rule_reference",
  "invalid_rule_snapshot",
  "invalid_canonical_value",
  "hash_mismatch",
  "duplicate_id",
  "invalid_predecessor_reference",
  "invalid_self_reference",
  "invalid_artifact_reference",
]);

export interface ReviewContractDraftRejection {
  readonly kind: "rejected";
  readonly code: ReviewContractRejectionCode;
  readonly message: string;
}

export type ReviewContractDraftValidation<T> =
  | Readonly<{ kind: "validated"; value: T }>
  | ReviewContractDraftRejection;

export type ReviewContractDraftRecoveryResult<T> =
  | Readonly<{
    kind: "validated";
    value: T;
    draft: string;
    repairAttempts: number;
  }>
  | Readonly<{
    kind: "rejected";
    rejection: ReviewContractDraftRejection;
    draft: string;
    repairAttempts: number;
    reason: "not_repairable" | "no_progress" | "attempt_limit";
  }>;

export function shouldRepairReviewContractRejection(code: ReviewContractRejectionCode): boolean {
  return REPAIRABLE_REJECTION_CODES.has(code);
}

/**
 * Revalidate each Pi-produced correction before it can reach authoritative
 * ingestion. This service owns only contract-shape recovery; it neither
 * interprets review findings nor selects the post-review workflow transition.
 */
export async function recoverReviewContractDraft<T>(input: {
  readonly initialDraft: string;
  readonly validate: (draft: string) => ReviewContractDraftValidation<T>;
  readonly repair: (context: {
    readonly draft: string;
    readonly rejection: ReviewContractDraftRejection;
    readonly attempt: number;
    readonly maximumAttempts: number;
  }) => Promise<string>;
  readonly maximumAttempts?: number;
}): Promise<ReviewContractDraftRecoveryResult<T>> {
  const maximumAttempts = input.maximumAttempts ?? DEFAULT_REVIEW_CONTRACT_REPAIR_ATTEMPTS;
  if (!Number.isInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error("maximumAttempts must be a positive integer");
  }

  let draft = input.initialDraft;
  let repairAttempts = 0;
  const seenDrafts = new Set<string>([draft]);

  while (true) {
    const validation = input.validate(draft);
    if (validation.kind === "validated") {
      return {
        kind: "validated",
        value: validation.value,
        draft,
        repairAttempts,
      };
    }

    if (!shouldRepairReviewContractRejection(validation.code)) {
      return {
        kind: "rejected",
        rejection: validation,
        draft,
        repairAttempts,
        reason: "not_repairable",
      };
    }

    if (repairAttempts >= maximumAttempts) {
      return {
        kind: "rejected",
        rejection: validation,
        draft,
        repairAttempts,
        reason: "attempt_limit",
      };
    }

    const repairedDraft = await input.repair({
      draft,
      rejection: validation,
      attempt: repairAttempts + 1,
      maximumAttempts,
    });
    repairAttempts += 1;

    if (seenDrafts.has(repairedDraft)) {
      return {
        kind: "rejected",
        rejection: validation,
        draft: repairedDraft,
        repairAttempts,
        reason: "no_progress",
      };
    }

    seenDrafts.add(repairedDraft);
    draft = repairedDraft;
  }
}
