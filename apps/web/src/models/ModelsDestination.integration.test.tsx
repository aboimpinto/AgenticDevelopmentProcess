// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ActiveCatalogConnectionState, type CatalogScanState, type ProviderConnectionId } from "@hepha/shared";
import type { RoutingPolicyApi } from "./routing-policy-api.js";
import { routingMatrixFixture } from "./test-support/routing-matrix-fixture.js";

vi.mock("../provider-connections/ProviderConnectionsView.js", () => ({
  ProviderConnectionsView: () => <div data-testid="provider-connections-view">Provider management</div>,
}));

import { ModelsDestination, type ModelsDestinationProps } from "./ModelsDestination.js";

const model = (connectionId: string, modelId: string, description: string | null = null) => ({
  schemaVersion: "model-catalog/v1" as const,
  identity: { connectionId, modelId }, providerKind: "known" as const, providerLabel: connectionId,
  displayName: "Shared model", description, contextWindowTokens: null, maxOutputTokens: null,
  inputModalities: ["text"] as const, capabilities: { reasoning: null, tools: true, api: null },
  pricing: null, availability: "available" as const, lastSuccessfulScanAt: "2026-07-22T19:05:00.000Z",
});

const connectionState = (connectionId: string, scanState: CatalogScanState = "available"): ActiveCatalogConnectionState => {
  const never = scanState === "never_scanned";
  const scanning = scanState === "scanning";
  const settled = !never && !scanning;
  const failed = scanState === "failed";
  return {
    schemaVersion: "catalog-reconciliation/v1", connectionId: connectionId as ProviderConnectionId,
    label: `Provider ${connectionId}`, providerKind: "known", lifecycleActive: true, scanState,
    trigger: never ? null : "individual_retry", attemptId: never ? null : `attempt-${connectionId}`,
    modelCount: settled ? (scanState === "available" ? 1 : 0) : null,
    claimedAt: never ? null : "2026-07-22T19:04:00.000Z", settledAt: settled ? "2026-07-22T19:05:00.000Z" : null,
    outcomeCode: settled ? (failed ? "unavailable" : "success") : null,
    safeMessage: settled ? (failed ? "Payment required." : "Scan completed.") : null,
    diagnosticId: settled ? `diagnostic-${connectionId}` : null,
    diagnosticOccurredAt: settled ? "2026-07-22T19:05:00.000Z" : null,
    guidanceCode: scanState === "never_scanned" ? "scan_not_started" : scanState === "scanning" ? "scan_in_progress"
      : scanState === "available" ? "models_available" : scanState === "empty" ? "no_models_returned" : "scan_failed",
  };
};

const diagnostic = (connectionId: string, outcome: "success" | "unavailable" = "success") => ({
  schemaVersion: "model-catalog/v1" as const, diagnosticId: `diagnostic-${connectionId}`,
  connectionId, scanCorrelationId: `scan-${connectionId}`, outcome,
  safeMessage: outcome === "success" ? "Scan completed." : "Payment required.",
  httpStatusCode: outcome === "success" ? null : 402, occurredAt: "2026-07-22T19:05:00.000Z",
});

function catalogProps(overrides: Partial<ModelsDestinationProps> = {}): ModelsDestinationProps {
  return {
    catalogApi: {
      readCatalog: vi.fn().mockResolvedValue([]), readConnectionStates: vi.fn().mockResolvedValue([]),
      scanActive: vi.fn().mockResolvedValue([]), scanConnection: vi.fn(), readDiagnostics: vi.fn().mockResolvedValue([]),
      ...overrides.catalogApi,
    },
    loadConnections: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelsDestination", () => {
  it("defaults an explicit Models visit to Available Models", () => {
    render(<ModelsDestination {...catalogProps()} />);
    expect(screen.getByRole("heading", { name: "Models" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Available Models" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("available-models-tab");
  });

  it("uses tabs with roving keyboard focus and explicit activation", () => {
    render(<ModelsDestination {...catalogProps()} />);
    const available = screen.getByRole("tab", { name: "Available Models" });
    const routing = screen.getByRole("tab", { name: "Routing Defaults" });
    const providers = screen.getByRole("tab", { name: "Provider Connections" });
    available.focus();
    fireEvent.keyDown(available, { key: "ArrowRight" });
    expect(document.activeElement).toBe(routing);
    expect(routing.getAttribute("aria-selected")).toBe("false");
    fireEvent.keyDown(routing, { key: "Enter" });
    expect(routing.getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(routing, { key: "Home" });
    expect(document.activeElement).toBe(providers);
    fireEvent.keyDown(providers, { key: " " });
    expect(screen.getByTestId("provider-connections-view")).toBeTruthy();
  });

  it("keeps provider management composed and offers a neutral routing handoff", async () => {
    const matrix = routingMatrixFixture();
    const routingPolicyApi: RoutingPolicyApi = {
      matrix: vi.fn().mockResolvedValue(matrix),
      preview: vi.fn(),
      save: vi.fn(),
      acknowledge: vi.fn(),
    };
    render(<ModelsDestination {...catalogProps({ routingPolicyApi })} />);
    fireEvent.click(screen.getByRole("tab", { name: "Provider Connections" }));
    expect(screen.getByTestId("provider-connections-view")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Routing Defaults" }));
    expect(await screen.findByRole("heading", { name: "Routing Defaults" })).toBeTruthy();
    expect(screen.getAllByText("OpenAI Personal · global-model").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("tab", { name: "Available Models" }));
    expect(screen.getByRole("tab", { name: "Available Models" }).getAttribute("aria-selected")).toBe("true");
  });

  it("clears only a failed connection selection while retaining unaffected current models and safe diagnostics", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const first = model("provider-a", "model-a", "A safe description");
    const second = model("provider-b", "model-b", "B safe description");
    const failedDiagnostic = diagnostic("provider-a", "unavailable");
    const api = {
      readCatalog: vi.fn().mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]),
      readConnectionStates: vi.fn().mockResolvedValue([connectionState("provider-a", "failed"), connectionState("provider-b")]),
      scanActive: vi.fn(),
      scanConnection: vi.fn().mockResolvedValue(connectionState("provider-a", "failed")),
      readDiagnostics: vi.fn().mockResolvedValue([failedDiagnostic]),
    };
    render(<ModelsDestination {...catalogProps({
      catalogApi: api,
      loadConnections: vi.fn().mockResolvedValue([
        { connectionId: "provider-a", label: "Provider A", providerLabel: "A", endpointUrl: "https://a.example" },
        { connectionId: "provider-b", label: "Provider B", providerLabel: "B", endpointUrl: "https://b.example" },
      ]),
    })} />);
    await screen.findByRole("option", { name: /Provider A · model-a/ });
    fireEvent.click(screen.getByRole("option", { name: /Provider A · model-a/ }));
    expect(screen.getByText("A safe description")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Scan selected connection" }));
    await waitFor(() => expect(screen.queryByRole("option", { name: /Provider A · model-a/ })).toBeNull());
    expect(screen.getByRole("option", { name: /Provider B · model-b/ })).toBeTruthy();
    expect(screen.queryByText("A safe description")).toBeNull();
    expect(screen.getAllByText("Payment required.")).toHaveLength(2);
    expect(screen.queryByText("test-secret-060")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("listbox", { name: "Available models" })));
  });

  it("retains an unaffected selected model after an all-connections failure", async () => {
    const first = model("provider-a", "model-a", "A safe description");
    const second = model("provider-b", "model-b", "B safe description");
    const failedDiagnostic = diagnostic("provider-a", "unavailable");
    render(<ModelsDestination {...catalogProps({
      catalogApi: {
        readCatalog: vi.fn().mockResolvedValueOnce([first, second]).mockResolvedValueOnce([second]),
        readConnectionStates: vi.fn().mockResolvedValue([connectionState("provider-a", "failed"), connectionState("provider-b")]),
        scanActive: vi.fn().mockResolvedValue([connectionState("provider-a", "failed"), connectionState("provider-b")]),
        scanConnection: vi.fn(), readDiagnostics: vi.fn().mockResolvedValue([failedDiagnostic]),
      },
      loadConnections: vi.fn().mockResolvedValue([
        { connectionId: "provider-a", label: "Provider A", providerLabel: "A", endpointUrl: "https://a.example" },
        { connectionId: "provider-b", label: "Provider B", providerLabel: "B", endpointUrl: "https://b.example" },
      ]),
    })} />);
    fireEvent.click(await screen.findByRole("option", { name: /Provider B · model-b/ }));
    fireEvent.click(screen.getByRole("button", { name: "Scan Models" }));
    await waitFor(() => expect(screen.queryByRole("option", { name: /Provider A · model-a/ })).toBeNull());
    expect(screen.getByText("B safe description")).toBeTruthy();
  });

  it("keeps zero-model active connections visible and retries only the selected row", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const states = [
      connectionState("provider-empty", "empty"),
      connectionState("provider-failed", "failed"),
      connectionState("provider-new", "never_scanned"),
    ];
    const api = {
      readCatalog: vi.fn().mockResolvedValue([]),
      readConnectionStates: vi.fn().mockResolvedValue(states),
      scanActive: vi.fn(),
      scanConnection: vi.fn().mockResolvedValue(connectionState("provider-failed", "available")),
      readDiagnostics: vi.fn().mockResolvedValue([]),
    };
    render(<ModelsDestination {...catalogProps({ catalogApi: api })} />);

    expect(await screen.findByLabelText("Catalog scan state: Empty")).toBeTruthy();
    expect(screen.getByLabelText("Catalog scan state: Failed")).toBeTruthy();
    expect(screen.getByLabelText("Catalog scan state: Never scanned")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Retry Provider provider-failed" });
    retry.focus();
    fireEvent.click(retry);
    await waitFor(() => expect(api.scanConnection).toHaveBeenCalledTimes(1));
    expect(api.scanConnection).toHaveBeenCalledWith("provider-failed");
    await waitFor(() => expect(api.readConnectionStates).toHaveBeenCalledTimes(2));
    expect(api.scanActive).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Retry Provider provider-failed" })));
    expect(screen.getByLabelText("Catalog scan state: Empty")).toBeTruthy();
    expect(screen.getByLabelText("Catalog scan state: Never scanned")).toBeTruthy();
  });

  it("keeps the flat immutable model list usable when active-state transport is unavailable", async () => {
    render(<ModelsDestination {...catalogProps({
      catalogApi: {
        readCatalog: vi.fn().mockResolvedValue([model("provider-a", "model-a")]),
        readConnectionStates: vi.fn().mockRejectedValue(new Error("malformed state")),
        scanActive: vi.fn(), scanConnection: vi.fn(), readDiagnostics: vi.fn(),
      },
      loadConnections: vi.fn().mockResolvedValue([
        { connectionId: "provider-a", label: "Provider A", providerLabel: "A", endpointUrl: "https://a.example" },
      ]),
    })} />);
    expect(await screen.findByRole("option", { name: /Provider A · model-a/ })).toBeTruthy();
    expect(screen.getByText("Active connection scan state is unavailable. Refresh the catalog and try again.")).toBeTruthy();
    expect(screen.queryByLabelText("Catalog scan state: Never scanned")).toBeNull();
  });

  it("keeps a selected overlap in progress without changing model identity or unrelated retry controls", async () => {
    const providerAModel = model("provider-a", "model-a", "Provider A model");
    const providerBModel = model("provider-b", "model-b", "Provider B model");
    const scanningStates = [connectionState("provider-a", "scanning"), connectionState("provider-b", "available")];
    const api = {
      readCatalog: vi.fn().mockResolvedValue([providerAModel, providerBModel]),
      readConnectionStates: vi.fn()
        .mockResolvedValueOnce([connectionState("provider-a"), connectionState("provider-b")])
        .mockResolvedValue(scanningStates),
      scanActive: vi.fn(),
      scanConnection: vi.fn().mockResolvedValue(scanningStates[0]),
      readDiagnostics: vi.fn().mockResolvedValue([]),
    };
    render(<ModelsDestination {...catalogProps({
      catalogApi: api,
      loadConnections: vi.fn().mockResolvedValue([
        { connectionId: "provider-a", label: "Provider A", providerLabel: "A", endpointUrl: "https://a.example" },
        { connectionId: "provider-b", label: "Provider B", providerLabel: "B", endpointUrl: "https://b.example" },
      ]),
    })} />);

    const selectedModel = await screen.findByRole("option", { name: /Provider A · model-a/ });
    fireEvent.click(selectedModel);
    fireEvent.click(screen.getByRole("button", { name: "Scan selected connection" }));

    expect(await screen.findByText("Catalog scan remains in progress.")).toBeTruthy();
    expect(screen.getByLabelText("Catalog scan state: Scanning")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scanning Provider provider-a" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Retry Provider provider-b" })).toHaveProperty("disabled", false);
    const retainedModel = screen.getByRole("option", { name: /Provider A · model-a/ });
    expect(retainedModel.id).toContain("provider-a:model-a");
    expect(screen.getByText("Catalog scan remains in progress.").textContent).not.toMatch(/completed|finished/i);
    expect(api.scanConnection).toHaveBeenCalledWith("provider-a");
    expect(api.readCatalog).toHaveBeenCalledTimes(2);
    expect(api.readConnectionStates).toHaveBeenCalledTimes(2);
    expect(api.readDiagnostics).not.toHaveBeenCalled();
  });

  it("keeps an all-active mixed scanning and failed response in progress while unrelated rows remain usable", async () => {
    const usableModel = model("provider-usable", "model-usable", "Usable model remains selectable");
    const mixedStates = [
      connectionState("provider-scanning", "scanning"),
      connectionState("provider-failed", "failed"),
      connectionState("provider-usable", "available"),
    ];
    const failedDiagnostic = diagnostic("provider-failed", "unavailable");
    const api = {
      readCatalog: vi.fn().mockResolvedValue([usableModel]),
      readConnectionStates: vi.fn()
        .mockResolvedValueOnce(mixedStates.map((state) => connectionState(state.connectionId, "available")))
        .mockResolvedValue(mixedStates),
      scanActive: vi.fn().mockResolvedValue(mixedStates),
      scanConnection: vi.fn(),
      readDiagnostics: vi.fn().mockResolvedValue([failedDiagnostic]),
    };
    render(<ModelsDestination {...catalogProps({
      catalogApi: api,
      loadConnections: vi.fn().mockResolvedValue([
        { connectionId: "provider-scanning", label: "Provider Scanning", providerLabel: "Scanning", endpointUrl: "https://scanning.example" },
        { connectionId: "provider-failed", label: "Provider Failed", providerLabel: "Failed", endpointUrl: "https://failed.example" },
        { connectionId: "provider-usable", label: "Provider Usable", providerLabel: "Usable", endpointUrl: "https://usable.example" },
      ]),
    })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Scan Models" }));

    expect(await screen.findByText("Catalog scan remains in progress.")).toBeTruthy();
    expect(screen.getByText("Catalog scan remains in progress.").textContent).not.toMatch(/completed|finished/i);
    expect(screen.getByRole("button", { name: "Scanning Provider provider-scanning" })).toHaveProperty("disabled", true);
    expect(screen.getAllByText("Payment required.")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Retry Provider provider-usable" })).toHaveProperty("disabled", false);
    const usableOption = screen.getByRole("option", { name: /Provider Usable · model-usable/ });
    expect(usableOption).toBeTruthy();
    fireEvent.click(usableOption);
    expect(screen.getByText("Usable model remains selectable")).toBeTruthy();
    expect(api.readDiagnostics).toHaveBeenCalledWith("provider-failed");
  });

  it("announces completion only for settled success and recovery only for settled failure", async () => {
    const initialStates = [connectionState("provider-available"), connectionState("provider-empty", "empty")];
    const completedStates = [connectionState("provider-available"), connectionState("provider-empty", "empty")];
    const failedStates = [connectionState("provider-available"), connectionState("provider-failed", "failed")];
    const failedDiagnostic = diagnostic("provider-failed", "unavailable");
    const api = {
      readCatalog: vi.fn().mockResolvedValue([]),
      readConnectionStates: vi.fn()
        .mockResolvedValueOnce(initialStates)
        .mockResolvedValueOnce(completedStates)
        .mockResolvedValue(failedStates),
      scanActive: vi.fn()
        .mockResolvedValueOnce(completedStates)
        .mockResolvedValueOnce(failedStates),
      scanConnection: vi.fn(),
      readDiagnostics: vi.fn().mockResolvedValue([failedDiagnostic]),
    };
    render(<ModelsDestination {...catalogProps({ catalogApi: api })} />);

    fireEvent.click(await screen.findByRole("button", { name: "Scan Models" }));
    expect(await screen.findByText("Catalog scan completed.")).toBeTruthy();
    expect(api.readDiagnostics).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Scan Models" }));
    expect(await screen.findByText("Catalog scan finished with a recovery notice.")).toBeTruthy();
    expect(api.readDiagnostics).toHaveBeenCalledTimes(1);
    expect(api.readDiagnostics).toHaveBeenCalledWith("provider-failed");
    expect(screen.getAllByText("Payment required.")).toHaveLength(2);
    expect(screen.queryByText(/provider-available.*Payment required/i)).toBeNull();
  });

  it("presents a Pi Session catalog row without an API-key field", async () => {
    render(<ModelsDestination {...catalogProps({
      catalogApi: { readCatalog: vi.fn().mockResolvedValue([model("pi-session", "pi-session-model")]), readConnectionStates: vi.fn().mockResolvedValue([connectionState("pi-session")]), scanActive: vi.fn(), scanConnection: vi.fn(), readDiagnostics: vi.fn() },
      loadConnections: vi.fn().mockResolvedValue([{ connectionId: "pi-session", label: "Pi Session", providerLabel: "Pi", endpointUrl: "local Pi session" }]),
    })} />);
    expect(await screen.findByRole("option", { name: /Pi Session · pi-session-model/ })).toBeTruthy();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();
  });
});
