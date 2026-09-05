import type { CatalogModelRecord, ProviderConnectionId } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import { catalogIdentityKey, filterCatalogRows, findCatalogRow, sameCatalogIdentity, toCatalogPresentation } from "./catalog-presentation.js";

const id = (value: string) => value as ProviderConnectionId;
const model = (connection: string, modelId: string, displayName = "Shared"): CatalogModelRecord => ({
  schemaVersion: "model-catalog/v1", identity: { connectionId: id(connection), modelId }, providerKind: "known",
  providerLabel: connection, displayName, description: null, contextWindowTokens: null, maxOutputTokens: null,
  inputModalities: [], capabilities: { reasoning: null, tools: null, api: null }, pricing: null,
  availability: "available", lastSuccessfulScanAt: "2026-07-22T19:05:00.000Z",
});

describe("catalog presentation", () => {
  it("preserves server order and keeps duplicate names distinct by complete identity", () => {
    const rows = toCatalogPresentation([model("first", "same"), model("second", "same")], [
      { connectionId: "first", label: "First", providerLabel: "First", endpointUrl: "https://first.example" },
      { connectionId: "second", label: "Second", providerLabel: "Second", endpointUrl: "https://second.example" },
    ]);
    expect(rows.map((row) => row.connectionLabel)).toEqual(["First", "Second"]);
    expect(catalogIdentityKey(rows[0]!.identity)).not.toBe(catalogIdentityKey(rows[1]!.identity));
    expect(findCatalogRow(rows, { connectionId: id("second"), modelId: "same" })?.connectionLabel).toBe("Second");
  });

  it("filters only current safe row text and does not infer unavailable rows", () => {
    const rows = toCatalogPresentation([model("pi", "pi-model", "Pi Model")], [
      { connectionId: "pi", label: "Pi Session", providerLabel: "Pi", endpointUrl: "local" },
    ]);
    expect(filterCatalogRows(rows, "session")).toHaveLength(1);
    expect(filterCatalogRows(rows, "absent")).toHaveLength(0);
  });

  it("clears a disappeared selection while retaining a different connection selection", () => {
    const remaining = toCatalogPresentation([model("connection-b", "model-b")], []);
    expect(findCatalogRow(remaining, { connectionId: id("connection-a"), modelId: "model-a" })).toBeNull();
    expect(findCatalogRow(remaining, { connectionId: id("connection-b"), modelId: "model-b" })).not.toBeNull();
    expect(sameCatalogIdentity({ connectionId: id("connection-a"), modelId: "model-a" }, { connectionId: id("connection-a"), modelId: "model-b" })).toBe(false);
  });
});
