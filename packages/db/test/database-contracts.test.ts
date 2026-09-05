import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  AgentInvocationRecord as PublicInvocation,
  CardMetadataStore as PublicStore,
  DeliveryMetadataRecord as PublicDelivery,
  ManualTestResultRecord as PublicManualResult,
  ScannedCardMetadata as PublicScannedCard,
} from "../src/index.js";
import type { ScannedCardMetadata as BoundedScannedCard } from "../src/contracts/card-contracts.js";
import type { CardMetadataStore as BoundedStore } from "../src/contracts/card-metadata-store.js";
import type { DeliveryMetadataRecord as BoundedDelivery } from "../src/contracts/delivery-contracts.js";
import type { ManualTestResultRecord as BoundedManualResult } from "../src/contracts/manual-test-contracts.js";
import type { AgentInvocationRecord as BoundedInvocation } from "../src/contracts/telemetry-contracts.js";

describe("database persistence contracts", () => {
  it("preserves bounded records through the package compatibility barrel", () => {
    expectTypeOf<BoundedScannedCard>().toEqualTypeOf<PublicScannedCard>();
    expectTypeOf<BoundedDelivery>().toEqualTypeOf<PublicDelivery>();
    expectTypeOf<BoundedInvocation>().toEqualTypeOf<PublicInvocation>();
    expectTypeOf<BoundedManualResult>().toEqualTypeOf<PublicManualResult>();
    expectTypeOf<BoundedStore>().toEqualTypeOf<PublicStore>();
  });

  it("carries scanned source identity without performing reconciliation", () => {
    const card = {
      cardKey: "card",
      documentHash: "hash",
      documentPath: "/repo/document.md",
      documentSize: 10,
      documentUpdatedAt: "2026-01-01T00:00:00.000Z",
      externalId: "ITEM-001",
      kind: "feature",
      projectId: "project",
      stateFolder: "03_IN_PROGRESS",
      title: "Work item",
    } satisfies BoundedScannedCard;

    expect(card.kind).toBe("feature");
    expect(card.documentHash).toBe("hash");
  });

  it("carries invocation evidence without starting an agent", () => {
    const invocation = {
      id: "invocation",
      projectId: "project",
      status: "completed",
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      durationMs: 1000,
    } satisfies BoundedInvocation;

    expect(invocation.status).toBe("completed");
    expect(invocation.durationMs).toBe(1000);
  });
});
