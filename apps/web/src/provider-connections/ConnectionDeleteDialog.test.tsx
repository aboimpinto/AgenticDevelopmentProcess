/**
 * FEAT-058: ConnectionDeleteDialog component tests
 *
 * Tests for guarded deletion dialog:
 * - Blocked deletion with dependency descriptors
 * - Unblocked deletion confirmation
 * - Only safe descriptors shown (no secrets)
 * - Keyboard/backdrop interaction
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConnectionDeleteDialog } from "./ConnectionDeleteDialog.js";
import type { DeletionPreflightDTO } from "./types.js";

function renderDialog(props: Partial<React.ComponentProps<typeof ConnectionDeleteDialog>> = {}) {
  return render(
    <ConnectionDeleteDialog
      connectionLabel="Test Connection"
      preflight={{ canDelete: true, blockers: [] }}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      isDeleting={false}
      error={null}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("ConnectionDeleteDialog", () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("renders the dialog heading", () => {
    renderDialog();
    expect(screen.getByText("Delete Connection")).toBeDefined();
    expect(screen.getByText("Danger Zone")).toBeDefined();
  });

  it("shows the connection name", () => {
    renderDialog({ connectionLabel: "My OpenAI Connection" });
    expect(screen.getByText(/My OpenAI Connection/)).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Non-blocked deletion
  // -----------------------------------------------------------------------

  it("shows confirm text when no blockers exist", () => {
    renderDialog({ preflight: { canDelete: true, blockers: [] } });
    expect(screen.getByText(/Are you sure you want to delete/)).toBeDefined();
    expect(screen.getByText(/Remove the stored secret/)).toBeDefined();
    expect(screen.getByText(/Permanently delete the connection/)).toBeDefined();
  });

  it("calls onConfirm with no blockers when deleting without dependencies", () => {
    const onConfirm = vi.fn();
    renderDialog({
      preflight: { canDelete: true, blockers: [] },
      onConfirm,
    });

    const confirmBtn = screen.getByText("Confirm Delete");
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  // -----------------------------------------------------------------------
  // Blocked deletion
  // -----------------------------------------------------------------------

  it("shows blocker descriptors when deletion is blocked", () => {
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        {
          blockerType: "routing_policy",
          safeDescriptor: "Code Review uses this connection",
        },
        {
          blockerType: "active_worker",
          safeDescriptor: "Active implementation session #42",
        },
      ],
    };
    const { container } = renderDialog({ preflight });

    // Should show dependency information instead of simple confirmation
    expect(container.textContent).toContain("active dependencies");
    expect(container.textContent).toContain("Routing Policy");
    expect(container.textContent).toContain("Active Worker");
    // Only safe descriptors shown
    expect(container.textContent).toContain("Code Review uses this connection");
    expect(container.textContent).toContain("Active implementation session #42");
    // Regression: factual blocker heading matches source wording
    expect(container.textContent).toContain("has active dependencies that must be resolved first");
    // Regression: footnote says "remove the connection's dependencies" not "routing policies will reset"
    expect(container.textContent).toContain("remove the connection's dependencies");
    expect(container.textContent).not.toContain("reset to Inherit");
    expect(container.textContent).not.toContain("routing policies will reset");
  });

  it("shows Acknowledge & Delete button when blockers exist", () => {
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "A routing policy" },
      ],
    };
    renderDialog({ preflight });
    expect(screen.getByText("Acknowledge & Delete")).toBeDefined();
  });

  it("calls onConfirm with acknowledged blockers", () => {
    const onConfirm = vi.fn();
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Code Review route" },
      ],
    };
    renderDialog({ preflight, onConfirm });

    const confirmBtn = screen.getByText("Acknowledge & Delete");
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledWith([
      { blockerType: "routing_policy", safeDescriptor: "Code Review route" },
    ]);
  });

  // -----------------------------------------------------------------------
  // Secret non-leak assertions
  // -----------------------------------------------------------------------

  it("does not render secret values in blocker descriptors", () => {
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        {
          blockerType: "routing_policy",
          safeDescriptor: "Policy referencing connection test-conn",
        },
      ],
    };
    const { container } = renderDialog({ preflight });
    const html = container.innerHTML;
    expect(html).not.toContain("sk-");
    expect(html).not.toContain("test-key");
    expect(html).not.toContain("api-key");
  });

  // -----------------------------------------------------------------------
  // Interaction behavior
  // -----------------------------------------------------------------------

  it("calls onCancel on backdrop click", () => {
    const onCancel = vi.fn();
    const { container } = renderDialog({ onCancel });

    const backdrop = container.querySelector(".provider-conn-backdrop")!;
    fireEvent.click(backdrop);

    expect(onCancel).toHaveBeenCalled();
  });

  it("calls onCancel when clicking Cancel button", () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(onCancel).toHaveBeenCalled();
  });

  it("disables buttons when deleting", () => {
    renderDialog({ isDeleting: true });

    const confirmBtn = screen.getByText("Deleting...") as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    const cancelBtn = screen.getByText("Cancel") as HTMLButtonElement;
    expect(cancelBtn.disabled).toBe(true);
  });

  it("displays external error", () => {
    renderDialog({ error: "Failed to delete connection" });
    expect(screen.getByText("Failed to delete connection")).toBeDefined();
  });
});
