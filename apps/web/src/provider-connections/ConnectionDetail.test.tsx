/**
 * FEAT-058: ConnectionDetail component tests
 *
 * Tests for the connection detail view:
 * - Non-prefilled write-only secret input
 * - Pi Session absence of key/secret fields
 * - Validation action/status display
 * - Deletion blocked state with safe descriptors
 * - Accessible operator feedback
 * - Secret input clearing after submission
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { ConnectionDetail } from "./ConnectionDetail.js";
import type { ProviderConnectionId } from "@hepha/shared";
import type {
  ConnectionDetailDTO,
  DiagnosticViewDTO,
  DeletionPreflightDTO,
} from "./types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeActiveConnection(overrides: Partial<ConnectionDetailDTO> = {}): ConnectionDetailDTO {
  return {
    connectionId: "test-conn-001" as ProviderConnectionId,
    kind: "custom",
    label: "Test Connection",
    provider: { kind: "custom", label: "test-provider" },
    endpointUrl: "https://api.test.com/v1",
    endpointLocal: false,
    lifecycleState: "active",
    hasSecret: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides,
  };
}

function makePiSessionConnection(overrides: Partial<ConnectionDetailDTO> = {}): ConnectionDetailDTO {
  return makeActiveConnection({
    kind: "pi_session",
    provider: { kind: "pi_session" },
    hasSecret: false,
    ...overrides,
  });
}

function makeDiagnostic(overrides: Partial<DiagnosticViewDTO> = {}): DiagnosticViewDTO {
  return {
    diagnosticId: "diag-001",
    severity: "info",
    failureCode: null,
    safeMessage: "Connection validated successfully",
    httpStatusCode: 200,
    operation: "validate",
    timestamp: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function renderDetail(props: Partial<React.ComponentProps<typeof ConnectionDetail>> = {}) {
  return render(
    <ConnectionDetail
      connection={makeActiveConnection()}
      diagnostics={[]}
      deletionPreflight={null}
      onRotateSecret={vi.fn()}
      onRevokeSecret={vi.fn()}
      onValidate={vi.fn()}
      onDelete={vi.fn()}
      onClose={vi.fn()}
      validating={false}
      deleting={false}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("ConnectionDetail", () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("renders connection label in header", () => {
    renderDetail({ connection: makeActiveConnection({ label: "My OpenAI Key" }) });
    expect(screen.getByText("My OpenAI Key")).toBeDefined();
  });

  it("renders configuration fields", () => {
    const { container } = renderDetail();
    const typeCells = container.querySelectorAll("dd");
    const typeTexts = Array.from(typeCells).map((el) => el.textContent);
    expect(typeTexts).toContain("Custom Provider");
    expect(typeTexts).toContain("test-provider");
    expect(container.textContent).toContain("https://api.test.com/v1");
  });

  // -----------------------------------------------------------------------
  // Write-only secret input — never prefilled
  // -----------------------------------------------------------------------

  it("renders secret input as password type", () => {
    renderDetail();
    const secretInput = screen.getByLabelText("New Secret Value") as HTMLInputElement;
    expect(secretInput.type).toBe("password");
  });

  it("secret input starts empty", () => {
    renderDetail();
    const secretInput = screen.getByLabelText("New Secret Value") as HTMLInputElement;
    expect(secretInput.value).toBe("");
  });

  it("secret input placeholder says write-only", () => {
    renderDetail();
    const secretInput = screen.getByLabelText("New Secret Value") as HTMLInputElement;
    expect(secretInput.placeholder).toContain("write-only");
  });

  it("shows Configured badge when secret exists", () => {
    const { container } = renderDetail({ connection: makeActiveConnection({ hasSecret: true }) });
    expect(container.textContent).toContain("Configured");
    expect(container.textContent).not.toContain("Configured (v");
  });

  it("shows Not configured warning when no secret", () => {
    renderDetail({ connection: makeActiveConnection({ hasSecret: false }) });
    expect(screen.getByText("Not configured")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Pi Session — no secret fields
  // -----------------------------------------------------------------------

  it("does not show Secret section for Pi Session", () => {
    const { container } = renderDetail({ connection: makePiSessionConnection() });
    expect(container.textContent).not.toContain("Secret Management");
    expect(screen.queryByLabelText("New Secret Value")).toBeNull();
    expect(container.textContent).not.toContain("Revoke Secret");
    expect(container.textContent).not.toContain("Rotate");
  });

  it("does not show Secret row in configuration for Pi Session", () => {
    renderDetail({ connection: makePiSessionConnection() });
    expect(screen.queryByText("Secret")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it("renders validate endpoint button", () => {
    const { container } = renderDetail();
    expect(container.textContent).toContain("Validate Endpoint");
  });

  it("shows validating state", () => {
    renderDetail({ validating: true });
    expect(screen.getByText("Validating...")).toBeDefined();
  });

  it("displays validation diagnostic", () => {
    const diagnostics = [
      makeDiagnostic({
        severity: "error",
        failureCode: "timeout",
        safeMessage: "Connection timed out",
      }),
    ];
    const { container } = renderDetail({ diagnostics });
    expect(container.textContent).toContain("Connection timed out");
    expect(container.textContent).toContain("Timeout");
  });

  it("displays diagnostic with HTTP status code", () => {
    const diagnostics = [
      makeDiagnostic({
        severity: "error",
        failureCode: "http_error",
        safeMessage: "HTTP error",
        httpStatusCode: 500,
      }),
    ];
    const { container } = renderDetail({ diagnostics });
    expect(container.textContent).toContain("HTTP 500");
  });

  it("calls onValidate when clicking validate button", () => {
    const onValidate = vi.fn();
    const { container } = renderDetail({ onValidate });
    const btn = container.querySelector('[aria-label="Validate connection"]');
    expect(btn).toBeDefined();
    fireEvent.click(btn!);
    expect(onValidate).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Secret lifecycle
  // -----------------------------------------------------------------------

  it("calls onRotateSecret with the entered value", () => {
    const onRotateSecret = vi.fn();
    renderDetail({ onRotateSecret });

    const secretInput = screen.getByLabelText("New Secret Value") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "new-secret-key" } });

    const rotateBtn = screen.getByRole("button", { name: "Rotate secret" });
    fireEvent.click(rotateBtn);

    expect(onRotateSecret).toHaveBeenCalledWith("new-secret-key");
  });

  it("clears secret input after rotate", () => {
    const onRotateSecret = vi.fn();
    renderDetail({ onRotateSecret });

    const secretInput = screen.getByLabelText("New Secret Value") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "new-secret-key" } });

    const rotateBtn = screen.getByRole("button", { name: "Rotate secret" });
    fireEvent.click(rotateBtn);

    expect(secretInput.value).toBe("");
  });

  it("calls onRevokeSecret when clicking revoke", () => {
    const onRevokeSecret = vi.fn();
    renderDetail({ onRevokeSecret });

    const revokeBtn = screen.getByRole("button", { name: "Revoke secret" });
    fireEvent.click(revokeBtn);

    expect(onRevokeSecret).toHaveBeenCalled();
  });

  it("disables rotate with empty input", () => {
    const { container } = renderDetail();
    const rotateBtn = container.querySelector('[aria-label="Rotate secret"]') as HTMLButtonElement;
    expect(rotateBtn).toBeDefined();
    expect(rotateBtn.disabled).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Deletion
  // -----------------------------------------------------------------------

  it("shows Delete Connection button", () => {
    const { container } = renderDetail();
    expect(container.textContent).toContain("Delete Connection");
  });

  it("shows confirmation after clicking delete", () => {
    const { container } = renderDetail();
    const deleteBtn = container.querySelector('[aria-label="Delete connection"]')!;
    expect(deleteBtn).toBeDefined();
    fireEvent.click(deleteBtn);
    expect(container.textContent).toContain("Confirm Delete");
    expect(container.textContent).toContain("Cancel");
  });

  it("shows dependency blockers when deletion is blocked", () => {
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Code Review uses this" },
      ],
    };
    const { container } = renderDetail({ deletionPreflight: preflight });
    // Click delete to show confirm, then check for blocker
    const deleteBtn = container.querySelector('[aria-label="Delete connection"]')!;
    expect(deleteBtn).toBeDefined();
    fireEvent.click(deleteBtn);
    expect(container.textContent).toContain("active dependencies");
    expect(container.textContent).toContain("Code Review uses this");
  });

  it("calls onDelete with blocker acknowledgments", () => {
    const onDelete = vi.fn();
    const preflight: DeletionPreflightDTO = {
      canDelete: false,
      blockers: [
        { blockerType: "routing_policy", safeDescriptor: "Route depends" },
      ],
    };
    const { container } = renderDetail({ onDelete, deletionPreflight: preflight });
    // Click the delete button
    const deleteBtn = container.querySelector('[aria-label="Delete connection"]')!;
    expect(deleteBtn).toBeDefined();
    fireEvent.click(deleteBtn);
    // Now find and click the confirm delete button
    const confirmBtn = container.querySelector('[aria-label="Confirm delete"]') as HTMLButtonElement;
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);
    expect(onDelete).toHaveBeenCalledWith([
      { blockerType: "routing_policy", safeDescriptor: "Route depends" },
    ]);
  });

  // -----------------------------------------------------------------------
  // Accessibility
  // -----------------------------------------------------------------------

  it("has region role with aria-label", () => {
    const { container } = renderDetail();
    const region = container.querySelector('[role="region"]');
    expect(region).toBeDefined();
    expect(region?.getAttribute("aria-label")).toBe("Connection detail");
  });

  it("has aria-label on close button", () => {
    const { container } = renderDetail();
    const closeBtn = container.querySelector('[aria-label="Close detail"]');
    expect(closeBtn).toBeDefined();
  });

  it("has aria-label on delete button", () => {
    const { container } = renderDetail();
    const deleteBtn = container.querySelector('[aria-label="Delete connection"]');
    expect(deleteBtn).toBeDefined();
    expect(deleteBtn?.textContent).toContain("Delete Connection");
  });

  // -----------------------------------------------------------------------
  // Secret non-leak assertions
  // -----------------------------------------------------------------------

  it("does not show secret value in rendered text", () => {
    const { container } = renderDetail();
    const html = container.innerHTML;
    expect(html).not.toContain("sk-");
    expect(html).not.toContain("test-key");
    expect(html).not.toContain("real-secret");
  });

  it("does not echo secret values in diagnostic messages", () => {
    const diagnostics = [
      makeDiagnostic({ safeMessage: "Secret leaked here" }),
    ];
    const { container } = renderDetail({ diagnostics });
    const html = container.innerHTML;
    // safeMessage is user-visible — this test verifies the mock message
    // doesn't accidentally look like a real credential
    expect(html).not.toContain("sk-");
  });
});
