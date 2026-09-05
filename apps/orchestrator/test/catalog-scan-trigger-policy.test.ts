import { describe, expect, it } from "vitest";
import type { ProviderConnectionId } from "@hepha/shared";
import {
  classifyCatalogScanTrigger,
  type CatalogScanTriggerFacts,
} from "../src/model-catalog/catalog-scan-trigger-policy.js";

const active: CatalogScanTriggerFacts = {
  connectionId: "connection-a" as ProviderConnectionId,
  kind: "custom",
  provider: { kind: "custom", label: "provider-a" },
  endpointUrl: "https://provider-a.test/v1",
  endpointLocal: false,
  lifecycleState: "active",
  credentialVersion: 1,
};

function classify(before: CatalogScanTriggerFacts | null, after: CatalogScanTriggerFacts) {
  return classifyCatalogScanTrigger({ before, after });
}

describe("classifyCatalogScanTrigger", () => {
  it("applies creation, reactivation, material-change, and credential precedence", () => {
    expect(classify(null, active)).toBe("connection_created");
    expect(classify({ ...active, lifecycleState: "revoked", endpointUrl: "https://old.test/v1", credentialVersion: 1 }, {
      ...active,
      endpointUrl: "https://new.test/v1",
      credentialVersion: 2,
    })).toBe("connection_reactivated");
    expect(classify(active, { ...active, endpointUrl: "https://new.test/v1", credentialVersion: 2 }))
      .toBe("material_connection_change");
    expect(classify(active, { ...active, provider: { kind: "custom", label: "provider-b" } }))
      .toBe("material_connection_change");
    expect(classify(active, { ...active, credentialVersion: 2 })).toBe("credential_changed");
  });

  it("does not scan label, timestamp-equivalent, inactive, or exact no-op transitions", () => {
    expect(classify(active, active)).toBeNull();
    expect(classify(active, { ...active })).toBeNull();
    expect(classify(active, { ...active, lifecycleState: "revoked", credentialVersion: 2 })).toBeNull();
    expect(classify(null, { ...active, lifecycleState: "revoked" })).toBeNull();
  });

  it("rejects a transition between different immutable connection identities", () => {
    expect(() => classify(active, { ...active, connectionId: "connection-b" as ProviderConnectionId }))
      .toThrow("Catalog scan trigger identities do not match.");
  });
});
