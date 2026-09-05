import type { ManualTestPackStatus } from "../manual-test-verification-policy.js";

// ---------------------------------------------------------------------------
// Legacy Migration Helper
// ---------------------------------------------------------------------------

/**
 * Check whether a legacy manual_tests_completed_at timestamp exists
 * without a corresponding pack/review record. Used for migration
 * compatibility: entries with legacy timestamps but no pack records
 * are treated as "legacy accepted".
 */
export function hasLegacyManualTestTimestamp(
  manualTestsCompletedAt: string | null,
  packStatus: ManualTestPackStatus | null,
): boolean {
  if (!manualTestsCompletedAt) return false;
  if (!packStatus) return true; // Legacy timestamp, no pack system yet
  if (packStatus.state === "missing") return true; // No pack ever generated
  return false;
}
