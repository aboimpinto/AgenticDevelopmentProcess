// @vitest-environment jsdom

import React from "react";
import type { ProviderConnectionId } from "@hepha/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CatalogModelList } from "./CatalogModelList.js";
import { CatalogRecoveryAttention } from "./CatalogRecoveryAttention.js";
import { CatalogToolbar } from "./CatalogToolbar.js";
import { SelectedModelDetail } from "./SelectedModelDetail.js";

const id = (value: string) => value as ProviderConnectionId;
const row = {
  connectionLabel: "Pi Session", endpointUrl: "local Pi session", identity: { connectionId: id("pi"), modelId: "pi-model" },
  model: {
    schemaVersion: "model-catalog/v1" as const, identity: { connectionId: id("pi"), modelId: "pi-model" }, providerKind: "pi_session" as const,
    providerLabel: "Pi Session", displayName: null, description: null, contextWindowTokens: null, maxOutputTokens: null,
    inputModalities: [], capabilities: { reasoning: null, tools: null, api: null }, pricing: null,
    availability: "available" as const, lastSuccessfulScanAt: "2026-07-22T19:05:00.000Z",
  },
};

afterEach(cleanup);

describe("catalog presentation components", () => {
  it("uses listbox keyboard selection with the complete identity", () => {
    const onSelect = vi.fn();
    render(<CatalogModelList onSelect={onSelect} rows={[row]} selectedIdentity={null} />);
    const listbox = screen.getByRole("listbox", { name: "Available models" });
    fireEvent.keyDown(listbox, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByRole("option", { name: /Pi Session · pi-model/ }));
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith({ connectionId: id("pi"), modelId: "pi-model" });
  });

  it("renders nullable details as explicit unknown values", () => {
    render(<SelectedModelDetail row={row} />);
    expect(screen.getAllByText("Not supplied").length).toBeGreaterThan(3);
    expect(screen.getByText("Pi Session · pi-model")).toBeTruthy();
  });

  it("keeps scan controls independently busy", () => {
    render(<CatalogToolbar isScanningAll onQueryChange={vi.fn()} onScanAll={vi.fn()} onScanSelected={vi.fn()} query="" isScanningSelected={false} selectedConnectionLabel="Pi Session" />);
    expect(screen.getByRole("button", { name: "Scanning Models…" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Scan selected connection" })).toHaveProperty("disabled", false);
  });

  it("renders only supplied safe recovery facts and contains no distinctive secret", () => {
    render(<CatalogRecoveryAttention diagnostic={{
      schemaVersion: "model-catalog/v1", diagnosticId: "diag", connectionId: id("pi"), scanCorrelationId: "scan",
      outcome: "unavailable", safeMessage: "Payment required.", httpStatusCode: 402, occurredAt: "2026-07-22T19:05:00.000Z",
    }} />);
    expect(screen.getByText("Payment required.")).toBeTruthy();
    expect(screen.queryByText("test-secret-060")).toBeNull();
  });
});
