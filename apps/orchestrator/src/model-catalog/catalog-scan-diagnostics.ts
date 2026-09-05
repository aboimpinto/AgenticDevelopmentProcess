import { randomUUID } from "node:crypto";
import {
  MODEL_CATALOG_SCHEMA_VERSION,
  type CatalogScanDiagnostic,
  type CatalogScanOutcome,
  type ProviderConnectionId,
} from "@hepha/shared";

const safeMessages: Record<CatalogScanOutcome, string> = {
  success: "Model catalog scan completed.",
  unavailable: "Provider catalog is unavailable.",
  authentication_failed: "Provider authentication was rejected.",
  timeout: "Provider catalog scan timed out.",
  redirect_rejected: "Provider catalog redirect was rejected.",
  malformed_response: "Provider catalog returned an invalid response.",
  normalization_failed: "Provider catalog response could not be normalized.",
  vault_unavailable: "Catalog credential vault is unavailable.",
  not_scannable: "Connection is not eligible for catalog scanning.",
  process_failed: "Pi catalog process did not complete successfully.",
};

/** Creates a closed diagnostic without preserving provider/process detail. */
export function createCatalogScanDiagnostic(input: {
  readonly connectionId: ProviderConnectionId;
  readonly scanCorrelationId: string;
  readonly outcome: CatalogScanOutcome;
  readonly httpStatusCode: number | null;
  readonly occurredAt: string;
  readonly diagnosticId?: string;
}): CatalogScanDiagnostic {
  return {
    schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
    diagnosticId: input.diagnosticId ?? randomUUID(),
    connectionId: input.connectionId,
    scanCorrelationId: input.scanCorrelationId,
    outcome: input.outcome,
    safeMessage: safeMessages[input.outcome],
    httpStatusCode: input.httpStatusCode,
    occurredAt: input.occurredAt,
  };
}
