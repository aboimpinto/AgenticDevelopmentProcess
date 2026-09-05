import {
  MODEL_CATALOG_SCHEMA_VERSION,
  type CatalogScanDiagnostic,
  type ProviderConnectionId,
} from "@hepha/shared";
import type { ModelCatalogStore } from "@hepha/db";

export interface CatalogFailClosedOutcomeInput {
  readonly connectionId: ProviderConnectionId;
  readonly attemptId: string;
  readonly diagnosticId: string;
  readonly occurredAt: string;
  readonly safeMessage: string;
}

export interface CatalogFailClosedOutcomeWriterOptions {
  readonly store: Pick<ModelCatalogStore, "applyIdempotentFailureOutcome" | "listModelsForConnection">;
  /** Receives only removed route identities and deterministic safe failure facts. */
  readonly onCatalogFailure?: (input: {
    readonly routes: readonly { readonly connectionId: ProviderConnectionId; readonly modelId: string }[];
    readonly reasonCode: "process_failed";
    readonly occurredAt: string;
    readonly correlationId: string;
  }) => void;
}

/** Applies replay-safe local catalog failure outcomes and preserves routing-reset safety. */
export class CatalogFailClosedOutcomeWriter {
  constructor(private readonly options: CatalogFailClosedOutcomeWriterOptions) {}

  apply(input: CatalogFailClosedOutcomeInput): CatalogScanDiagnostic {
    const removedRoutes = this.options.store.listModelsForConnection(input.connectionId)
      .map((model) => model.identity);
    const diagnostic: CatalogScanDiagnostic = {
      schemaVersion: MODEL_CATALOG_SCHEMA_VERSION,
      diagnosticId: input.diagnosticId,
      connectionId: input.connectionId,
      scanCorrelationId: input.attemptId,
      outcome: "process_failed",
      safeMessage: input.safeMessage,
      httpStatusCode: null,
      occurredAt: input.occurredAt,
    };
    this.options.store.applyIdempotentFailureOutcome({
      connectionId: input.connectionId,
      models: [],
      diagnostic,
    });
    if (removedRoutes.length > 0) {
      this.options.onCatalogFailure?.({
        routes: removedRoutes,
        reasonCode: "process_failed",
        occurredAt: input.occurredAt,
        correlationId: input.attemptId,
      });
    }
    return diagnostic;
  }
}
