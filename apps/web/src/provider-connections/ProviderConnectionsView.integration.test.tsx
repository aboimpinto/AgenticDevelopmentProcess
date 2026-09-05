// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderConnectionsView } from "./ProviderConnectionsView.js";

const connection = {
  connectionId: "connection-a",
  kind: "known",
  label: "OpenAI Work",
  providerLabel: "OpenAI",
  endpointUrl: "https://api.openai.example/v1",
  endpointLocal: false,
  lifecycleState: "active",
  hasSecret: true,
  createdAt: "2026-07-24T17:00:00.000Z",
  updatedAt: "2026-07-24T17:00:00.000Z",
};

const connectionDetail = {
  ...connection,
  provider: { kind: "known", providerId: "openai" },
};

const emptyState = {
  schemaVersion: "catalog-reconciliation/v1",
  connectionId: "connection-a",
  label: "OpenAI Work",
  providerKind: "known",
  lifecycleActive: true,
  scanState: "empty",
  trigger: "individual_retry",
  attemptId: "attempt-a",
  modelCount: 0,
  claimedAt: "2026-07-24T17:00:00.000Z",
  settledAt: "2026-07-24T17:01:00.000Z",
  outcomeCode: "success",
  safeMessage: "No models returned.",
  diagnosticId: "diagnostic-a",
  diagnosticOccurredAt: "2026-07-24T17:01:00.000Z",
  guidanceCode: "no_models_returned",
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProviderConnectionsView catalog-state composition", () => {
  it("joins the canonical state collection into the real provider list by connection ID", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/provider-connections") return response([connection]);
      if (path === "/api/model-catalog/connections") {
        return response({ schemaVersion: "catalog-reconciliation/v1", connections: [emptyState] });
      }
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<ProviderConnectionsView />);
    expect(await screen.findByText("OpenAI Work")).toBeTruthy();
    expect(await screen.findByLabelText("Catalog scan state: Empty")).toBeTruthy();
  });

  it("shows Unavailable for an active row when the guarded state transport rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path === "/api/provider-connections") return response([connection]);
      if (path === "/api/model-catalog/connections") return response({ results: [] });
      throw new Error(`Unexpected request: ${path}`);
    }));

    render(<ProviderConnectionsView />);
    expect(await screen.findByText("OpenAI Work")).toBeTruthy();
    expect(await screen.findByLabelText("Catalog scan state: Unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Catalog scan state: Never scanned")).toBeNull();
  });

  it("refreshes authoritative catalog state after creating a connection", async () => {
    let listedConnections: Array<typeof connection> = [];
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (path === "/api/provider-connections" && method === "POST") {
        listedConnections = [connection];
        return response(connectionDetail);
      }
      if (path === "/api/provider-connections") return response(listedConnections);
      if (path === `/api/provider-connections/${connection.connectionId}`) return response(connectionDetail);
      if (path.endsWith("/diagnostics")) return response([]);
      if (path.endsWith("/delete-preflight")) return response({ canDelete: true, blockers: [] });
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const readConnectionStates = vi.fn().mockResolvedValue([emptyState]);

    render(<ProviderConnectionsView catalogStateApi={{ readConnectionStates }} />);
    await screen.findByText("No provider connections configured.");
    fireEvent.click(screen.getByRole("button", { name: "Create new provider connection" }));
    fireEvent.change(await screen.findByLabelText("API Key / Secret"), { target: { value: "write-only-test-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Create Connection" }));

    await waitFor(() => expect(readConnectionStates).toHaveBeenCalledTimes(2));
    expect(await screen.findByLabelText("Catalog scan state: Empty")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/provider-connections", expect.objectContaining({ method: "POST" }));
  });

  it("refreshes authoritative catalog state after rotate, revoke, and delete mutations", async () => {
    let listedConnections: Array<typeof connection> = [connection];
    const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (path === "/api/provider-connections") return response(listedConnections);
      if (path.endsWith("/diagnostics")) return response([]);
      if (path.endsWith("/delete-preflight")) return response({ canDelete: true, blockers: [] });
      if (path.endsWith("/secrets/rotate") && method === "POST") return response({ version: 2 });
      if (path.endsWith("/secrets/revoke") && method === "POST") return response(undefined);
      if (path === `/api/provider-connections/${connection.connectionId}` && method === "DELETE") {
        listedConnections = [];
        return response(undefined);
      }
      if (path === `/api/provider-connections/${connection.connectionId}`) return response(connectionDetail);
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const readConnectionStates = vi.fn().mockResolvedValue([emptyState]);

    render(<ProviderConnectionsView catalogStateApi={{ readConnectionStates }} />);
    fireEvent.click(await screen.findByRole("option", { name: /OpenAI Work/ }));
    fireEvent.change(await screen.findByLabelText("New Secret Value"), { target: { value: "rotated-test-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "Rotate secret" }));
    await waitFor(() => expect(readConnectionStates).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "Revoke secret" }));
    await waitFor(() => expect(readConnectionStates).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole("button", { name: "Delete connection" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirm Delete" }));
    await waitFor(() => expect(readConnectionStates).toHaveBeenCalledTimes(4));
    await screen.findByText("No provider connections configured.");

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/provider-connections/${connection.connectionId}/secrets/rotate`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/provider-connections/${connection.connectionId}/secrets/revoke`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/provider-connections/${connection.connectionId}`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

function response(body: unknown): Response {
  return { ok: true, json: vi.fn().mockResolvedValue(body) } as unknown as Response;
}
