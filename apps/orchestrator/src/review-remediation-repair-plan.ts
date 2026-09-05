export interface ConstrainedFixerResponseRepairPlan {
  readonly kind: "complete" | "repair" | "capped";
  readonly missingResponseIds: readonly string[];
  readonly repairAttempt: number;
}

/**
 * Routes only a contract-confirmed incomplete Fixer Response back to the
 * narrow report-repair worker. Worker errors and prose are intentionally not
 * inputs to this decision.
 */
export function planConstrainedFixerResponseRepair({
  maximumRepairAttempts,
  missingResponseIds,
  repairAttempts,
}: {
  maximumRepairAttempts: number;
  missingResponseIds: readonly string[];
  repairAttempts: number;
}): ConstrainedFixerResponseRepairPlan {
  if (missingResponseIds.length === 0) {
    return { kind: "complete", missingResponseIds, repairAttempt: repairAttempts };
  }

  if (repairAttempts >= maximumRepairAttempts) {
    return { kind: "capped", missingResponseIds, repairAttempt: repairAttempts };
  }

  return {
    kind: "repair",
    missingResponseIds,
    repairAttempt: repairAttempts + 1,
  };
}
