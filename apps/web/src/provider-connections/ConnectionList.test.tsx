/**
 * FEAT-058: ConnectionList component tests
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConnectionList } from "./ConnectionList.js";
import type { ActiveCatalogConnectionState, ProviderConnectionId } from "@hepha/shared";
import type { ConnectionSummaryDTO } from "./types.js";

function makeSummary(id: string, overrides: Partial<ConnectionSummaryDTO> = {}): ConnectionSummaryDTO {
  return {
    connectionId: id as ProviderConnectionId,
    kind: "custom",
    label: `Connection ${id}`,
    providerLabel: "test-provider",
    endpointUrl: "https://api.test.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    hasSecret: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const makeConn = makeSummary;

function makeCatalogState(id: string, scanState: "never_scanned" | "empty" = "empty"): ActiveCatalogConnectionState {
  const never = scanState === "never_scanned";
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: id as ProviderConnectionId,
    label: `Connection ${id}`,
    providerKind: "custom",
    lifecycleActive: true,
    scanState,
    trigger: never ? null : "individual_retry",
    attemptId: never ? null : `attempt-${id}`,
    modelCount: never ? null : 0,
    claimedAt: never ? null : "2026-07-24T17:00:00.000Z",
    settledAt: never ? null : "2026-07-24T17:01:00.000Z",
    outcomeCode: never ? null : "success",
    safeMessage: never ? null : "No models returned.",
    diagnosticId: never ? null : `diagnostic-${id}`,
    diagnosticOccurredAt: never ? null : "2026-07-24T17:01:00.000Z",
    guidanceCode: never ? "scan_not_started" : "no_models_returned",
  };
}

afterEach(cleanup);

describe("ConnectionList", () => {
  it("shows loading state", () => {
    render(
      <ConnectionList
        connections={[]}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
        loading={true}
      />,
    );
    expect(screen.getByText("Loading connections...")).toBeDefined();
  });

  it("shows empty state", () => {
    render(
      <ConnectionList
        connections={[]}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("No provider connections configured.")).toBeDefined();
  });

  it("renders connection list", () => {
    const connections = [
      makeConn("1", { label: "OpenAI" }),
      makeConn("2", { label: "DeepSeek" }),
    ];
    render(
      <ConnectionList
        connections={connections}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("DeepSeek")).toBeDefined();
  });

  it("calls onSelect when clicking a connection", () => {
    const onSelect = vi.fn();
    const connections = [makeConn("1", { label: "Test" })];
    render(
      <ConnectionList
        connections={connections}
        onSelect={onSelect}
        onCreateNew={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Test"));
    expect(onSelect).toHaveBeenCalledWith("1");
  });

  it("calls onCreateNew when clicking the button", () => {
    const onCreateNew = vi.fn();
    const { container } = render(
      <ConnectionList
        connections={[]}
        onSelect={vi.fn()}
        onCreateNew={onCreateNew}
      />,
    );
    const btn = container.querySelector(".provider-connections-create-btn")!;
    fireEvent.click(btn);
    expect(onCreateNew).toHaveBeenCalled();
  });

  it("shows Pi Session badge for Pi connections", () => {
    const connections = [makeConn("1", { kind: "pi_session" })];
    render(
      <ConnectionList
        connections={connections}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("Pi Session")).toBeDefined();
  });

  it("shows status badge for revoked connection", () => {
    const connections = [makeConn("1", { lifecycleState: "revoked" })];
    render(
      <ConnectionList
        connections={connections}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByText("Revoked")).toBeDefined();
  });

  it("highlights selected connection", () => {
    const connections = [makeConn("1"), makeConn("2")];
    const { container } = render(
      <ConnectionList
        connections={connections}
        selectedId="1"
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    const items = container.querySelectorAll(".provider-connections-item");
    expect(items[0].classList.contains("selected")).toBe(true);
    expect(items[1].classList.contains("selected")).toBe(false);
  });

  it("shows the authoritative catalog badge by immutable connection identity", () => {
    render(
      <ConnectionList
        catalogStates={[makeCatalogState("1", "empty")]}
        connections={[makeConn("1"), makeConn("2")]}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Catalog scan state: Empty")).toBeTruthy();
    expect(screen.getByLabelText("Catalog scan state: Unavailable")).toBeTruthy();
    expect(screen.queryByLabelText("Catalog scan state: Never scanned")).toBeNull();
  });

  it("does not fabricate active scan state for unavailable transport or inactive connections", () => {
    render(
      <ConnectionList
        catalogStateUnavailable
        catalogStates={[makeCatalogState("1", "never_scanned")]}
        connections={[makeConn("1"), makeConn("2", { lifecycleState: "revoked" })]}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    expect(screen.getAllByLabelText("Catalog scan state: Unavailable")).toHaveLength(1);
    expect(screen.queryByLabelText("Catalog scan state: Never scanned")).toBeNull();
  });

  it("does not render secret values", () => {
    const connections = [makeConn("1", { hasSecret: true })];
    render(
      <ConnectionList
        connections={connections}
        onSelect={vi.fn()}
        onCreateNew={vi.fn()}
      />,
    );
    // The badge says "Secret configured" but never the actual value
    const secretBadges = screen.getAllByText("Secret configured");
    expect(secretBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/sk-/)).toBeNull();
    expect(screen.queryByText(/test-key/)).toBeNull();
  });
});
