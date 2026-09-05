import {
  REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES,
  REVIEW_ARTIFACT_MAX_STRING_LENGTH,
  isValidKebabCaseIdentifier,
  isValidProjectRelativePath,
} from "../review-contract-types.js";
import { isPlainObject, reject } from "./envelope-safety.js";
import type { PolicyRejection } from "./policy-types.js";

/** Validate inspected, affected, and confirmed-unaffected code surfaces. */
export function validateSurface(value: unknown): PolicyRejection | undefined {
  if (!isPlainObject(value)) return reject("invalid_shape");
  const s = value as Record<string, unknown>;

  const surfaceKeys = new Set(["inspected", "affected", "confirmedUnaffected"]);
  if (Object.keys(s).some((k) => !surfaceKeys.has(k))) return reject("invalid_shape");

  // F4: Track duplicate IDs within each collection and affected/confirmedUnaffected overlap
  const allAffectedIds = new Set<string>();
  const allConfirmedUnaffectedIds = new Set<string>();

  for (const key of ["inspected", "affected", "confirmedUnaffected"] as const) {
    if (!Array.isArray(s[key])) return reject("invalid_shape");
    if (s[key].length > REVIEW_ARTIFACT_MAX_COLLECTION_ENTRIES) return reject("invalid_shape");

    const seenSurfaceIds = new Set<string>();
    for (const entry of s[key] as unknown[]) {
      if (!isPlainObject(entry)) return reject("invalid_shape");
      const e = entry as Record<string, unknown>;

      if (typeof e.surfaceId !== "string" || !isValidKebabCaseIdentifier(e.surfaceId)) return reject("invalid_shape");
      // F4: Reject duplicate surfaceId within the same collection
      if (seenSurfaceIds.has(e.surfaceId as string)) return reject("duplicate_id");
      seenSurfaceIds.add(e.surfaceId as string);

      if (typeof e.relativePath !== "string" || !isValidProjectRelativePath(e.relativePath)) return reject("invalid_shape");

      if (e.symbol !== undefined && (typeof e.symbol !== "string" || e.symbol.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");
      if (e.endpoint !== undefined && (typeof e.endpoint !== "string" || e.endpoint.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");
      if (e.rationale !== undefined && (typeof e.rationale !== "string" || e.rationale.length > REVIEW_ARTIFACT_MAX_STRING_LENGTH)) return reject("invalid_shape");

      // Reject unknown keys
      const allowedEntryKeys = new Set(["surfaceId", "relativePath", "symbol", "endpoint", "rationale"]);
      if (Object.keys(e).some((k) => !allowedEntryKeys.has(k))) return reject("invalid_shape");

      // Track for cross-collection overlap check
      if (key === "affected") allAffectedIds.add(e.surfaceId as string);
      if (key === "confirmedUnaffected") allConfirmedUnaffectedIds.add(e.surfaceId as string);
    }
  }

  // F4: Reject affected/confirmedUnaffected overlap
  for (const id of allAffectedIds) {
    if (allConfirmedUnaffectedIds.has(id)) return reject("invalid_shape");
  }

  return undefined;
}

