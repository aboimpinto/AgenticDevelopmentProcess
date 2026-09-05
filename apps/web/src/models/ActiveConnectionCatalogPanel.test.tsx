// @vitest-environment jsdom

import React from "react";
import type { ActiveCatalogConnectionState, CatalogScanState, ProviderConnectionId } from "@hepha/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActiveConnectionCatalogPanel } from "./ActiveConnectionCatalogPanel.js";

function state(connectionId: string, scanState: CatalogScanState): ActiveCatalogConnectionState {
  const never = scanState === "never_scanned";
  const scanning = scanState === "scanning";
  const settled = !never && !scanning;
  const failed = scanState === "failed";
  return {
    schemaVersion: "catalog-reconciliation/v1",
    connectionId: connectionId as ProviderConnectionId,
    label: `Provider ${connectionId}`,
    providerKind: connectionId === "pi" ? "pi_session" : "known",
    lifecycleActive: true,
    scanState,
    trigger: never ? null : "individual_retry",
    attemptId: never ? null : `attempt-${connectionId}`,
    modelCount: settled ? (scanState === "available" ? 2 : 0) : null,
    claimedAt: never ? null : "2026-07-24T17:00:00.000Z",
    settledAt: settled ? "2026-07-24T17:01:00.000Z" : null,
    outcomeCode: settled ? (failed ? "unavailable" : "success") : null,
    safeMessage: settled ? (failed ? "Payment required." : "Scan completed safely.") : null,
    diagnosticId: settled ? `diagnostic-${connectionId}` : null,
    diagnosticOccurredAt: settled ? "2026-07-24T17:01:00.000Z" : null,
    guidanceCode: scanState === "never_scanned" ? "scan_not_started"
      : scanState === "scanning" ? "scan_in_progress"
      : scanState === "available" ? "models_available"
      : scanState === "empty" ? "no_models_returned"
      : "scan_failed",
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ActiveConnectionCatalogPanel", () => {
  it("renders every authoritative state including zero-model rows and safe guidance", () => {
    const states = [
      state("a", "never_scanned"),
      state("b", "scanning"),
      state("c", "available"),
      state("d", "empty"),
      state("e", "failed"),
    ];
    render(<ActiveConnectionCatalogPanel connections={states} onRetry={vi.fn()} retryingConnectionIds={new Set()} stateUnavailable={false} />);

    for (const label of ["Never scanned", "Scanning", "Available", "Empty", "Failed"]) {
      expect(screen.getByLabelText(`Catalog scan state: ${label}`)).toBeTruthy();
    }
    expect(screen.getByText("Payment required.").getAttribute("role")).toBe("alert");
    expect(screen.getByRole("button", { name: "Scanning Provider b" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Retry Provider a" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Retry Provider c" })).toHaveProperty("disabled", false);
    expect(screen.queryByText("test-secret-feat-069")).toBeNull();
  });

  it("disables only the initiating retry, leaves unrelated rows usable, and restores focus", async () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    let settle: (() => void) | undefined;
    const onRetry = vi.fn().mockImplementation(() => new Promise<void>((resolve) => { settle = resolve; }));
    const { rerender } = render(
      <ActiveConnectionCatalogPanel
        connections={[state("a", "failed"), state("b", "empty")]}
        onRetry={onRetry}
        retryingConnectionIds={new Set()}
        stateUnavailable={false}
      />,
    );
    const retryA = screen.getByRole("button", { name: "Retry Provider a" });
    retryA.focus();
    fireEvent.click(retryA);
    expect(onRetry).toHaveBeenCalledWith("a");

    rerender(
      <ActiveConnectionCatalogPanel
        connections={[state("a", "failed"), state("b", "empty")]}
        onRetry={onRetry}
        retryingConnectionIds={new Set(["a"])}
        stateUnavailable={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Retrying Provider a" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Retry Provider b" })).toHaveProperty("disabled", false);

    settle?.();
    rerender(
      <ActiveConnectionCatalogPanel
        connections={[state("a", "available"), state("b", "empty")]}
        onRetry={onRetry}
        retryingConnectionIds={new Set()}
        stateUnavailable={false}
      />,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Retry Provider a" })));
  });

  it("renders an honest unavailable state instead of inventing Never scanned", () => {
    render(<ActiveConnectionCatalogPanel connections={[]} onRetry={vi.fn()} retryingConnectionIds={new Set()} stateUnavailable />);
    expect(screen.getByText("Active connection scan state is unavailable. Refresh the catalog and try again.")).toBeTruthy();
    expect(screen.queryByText("Never scanned")).toBeNull();
  });
});
