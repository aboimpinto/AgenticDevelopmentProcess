import type { CardMetadataStore } from "@hepha/db";

// ---------------------------------------------------------------------------
// Adapter Input
// ---------------------------------------------------------------------------

export interface ManualTestAdapterContext {
  readonly projectRoot: string;
  readonly projectId: string;
  readonly cardKey: string;
  readonly featExternalId: string;
  readonly featTitle: string;
  readonly epicExternalId: string | null;
  readonly featFolderPath: string;
  readonly store: CardMetadataStore;
}
