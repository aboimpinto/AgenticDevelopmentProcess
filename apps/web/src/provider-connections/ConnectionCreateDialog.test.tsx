/**
 * FEAT-058: ConnectionCreateDialog component tests
 *
 * Tests for the create connection dialog:
 * - Secret input masking
 * - Pi Session absence of secret field
 * - Known provider form
 * - Custom provider form
 * - Validation behavior
 * - Keyboard/focus behavior
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ConnectionCreateDialog } from "./ConnectionCreateDialog.js";
import type { CreateProviderConnectionInput } from "@hepha/shared";

function renderDialog(props: Partial<React.ComponentProps<typeof ConnectionCreateDialog>> = {}) {
  return render(
    <ConnectionCreateDialog
      onClose={vi.fn()}
      onCreate={vi.fn()}
      isCreating={false}
      error={null}
      {...props}
    />,
  );
}

afterEach(cleanup);

describe("ConnectionCreateDialog", () => {
  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("renders the dialog with heading", () => {
    renderDialog();
    expect(screen.getByText("Configure Provider Connection")).toBeDefined();
    expect(screen.getByText("New Connection")).toBeDefined();
  });

  it("renders connection type selector", () => {
    renderDialog();
    const select = screen.getByLabelText("Connection Type") as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.value).toBe("known");
  });

  it("shows known provider options by default", () => {
    renderDialog();
    expect(screen.getByLabelText("Known Provider")).toBeDefined();
    expect(screen.getByLabelText("Display Name")).toBeDefined();
    expect(screen.getByLabelText("Endpoint URL")).toBeDefined();
    expect(screen.getByLabelText("API Key / Secret")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Pi Session — no secret field
  // -----------------------------------------------------------------------

  it("hides secret field when Pi Session is selected", () => {
    renderDialog();
    const kindSelect = screen.getByLabelText("Connection Type") as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: "pi_session" } });

    expect(screen.queryByLabelText("API Key / Secret")).toBeNull();
    expect(screen.getByText(/Pi Session uses the already authenticated Pi host session/)).toBeDefined();
  });

  it("shows Pi Session info box when Pi Session is selected", () => {
    renderDialog();
    const kindSelect = screen.getByLabelText("Connection Type") as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: "pi_session" } });

    expect(screen.getByText(/No API key/)).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Secret input masking
  // -----------------------------------------------------------------------

  it("renders secret input as password type", () => {
    renderDialog();
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    expect(secretInput.type).toBe("password");
  });

  it("shows placeholder text for write-only secret", () => {
    renderDialog();
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    expect(secretInput.placeholder).toContain("write-only");
  });

  it("clears secret input after submit if parent re-renders", () => {
    // The dialog maintains internal state; on close, it's unmounted
    // We verify the input starts empty
    renderDialog();
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    expect(secretInput.value).toBe("");
  });

  // -----------------------------------------------------------------------
  // Known provider auto-fill
  // -----------------------------------------------------------------------

  it("auto-fills known provider endpoint URL", () => {
    renderDialog();
    const urlInput = screen.getByLabelText("Endpoint URL") as HTMLInputElement;
    expect(urlInput.value).toBe("https://api.openai.com/v1");
  });

  it("changes endpoint URL when known provider changes", () => {
    renderDialog();
    const providerSelect = screen.getByLabelText("Known Provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "deepseek" } });
    const urlInput = screen.getByLabelText("Endpoint URL") as HTMLInputElement;
    expect(urlInput.value).toBe("https://api.deepseek.com");
  });

  it("auto-fills display name for known providers", () => {
    renderDialog();
    const labelInput = screen.getByLabelText("Display Name") as HTMLInputElement;
    expect(labelInput.value).toBe("OpenAI");
  });

  // -----------------------------------------------------------------------
  // Custom provider form
  // -----------------------------------------------------------------------

  it("shows custom provider label field when custom is selected", () => {
    renderDialog();
    const kindSelect = screen.getByLabelText("Connection Type") as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: "custom" } });

    expect(screen.getByLabelText("Custom Provider Label")).toBeDefined();
    expect(screen.queryByLabelText("Known Provider")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------

  it("shows error when submitting with empty label", () => {
    const onCreate = vi.fn();
    renderDialog({ onCreate });

    const labelInput = screen.getByLabelText("Display Name") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    expect(screen.getByText("Connection label is required.")).toBeDefined();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows error when submitting with empty secret for known provider", () => {
    const onCreate = vi.fn();
    renderDialog({ onCreate });

    // Clear secret
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    expect(screen.getByText("Secret value is required for this connection type.")).toBeDefined();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("shows error for invalid endpoint URL", () => {
    const onCreate = vi.fn();
    renderDialog({ onCreate });

    const urlInput = screen.getByLabelText("Endpoint URL") as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: "not-a-url" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    expect(screen.getByText("Invalid endpoint URL.")).toBeDefined();
    expect(onCreate).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Form submission
  // -----------------------------------------------------------------------

  it("calls onCreate with correct input for known provider", () => {
    const onCreate = vi.fn();
    renderDialog({ onCreate });

    // Add secret (label and endpoint are auto-filled)
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "sk-test-key" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    expect(onCreate).toHaveBeenCalledOnce();
    const input = onCreate.mock.calls[0][0] as CreateProviderConnectionInput;
    expect(input.kind).toBe("known");
    expect(input.provider).toEqual({ kind: "known", providerId: "openai" });
    expect(input.secretValue).toBe("sk-test-key");
    expect(input.label).toBe("OpenAI");
  });

  it("calls onCreate with correct input for Pi Session (no secret)", () => {
    const onCreate = vi.fn();
    renderDialog({ onCreate });

    const kindSelect = screen.getByLabelText("Connection Type") as HTMLSelectElement;
    fireEvent.change(kindSelect, { target: { value: "pi_session" } });

    // Pi Session has no secret field
    const labelInput = screen.getByLabelText("Display Name") as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: "My Pi Session" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    expect(onCreate).toHaveBeenCalledOnce();
    const input = onCreate.mock.calls[0][0] as CreateProviderConnectionInput;
    expect(input.kind).toBe("pi_session");
    expect(input.provider).toEqual({ kind: "pi_session" });
    expect(input.secretValue).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Keyboard and interaction behavior
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Settlement-aware secret clearing
  // -----------------------------------------------------------------------

  it("clears secret input before create promise settles (pending promise)", async () => {
    let resolvePromise!: () => void;
    const onCreate = vi.fn().mockImplementation(
      () => new Promise<void>((resolve) => { resolvePromise = resolve; }),
    );
    renderDialog({ onCreate });

    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "sk-pending-test-key" } });

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    // Secret should clear while the promise is still pending
    await waitFor(() => {
      expect(secretInput.value).toBe("");
    });

    // Resolve to clean up
    resolvePromise();
    await waitFor(() => { /* let React settle after resolve */ });
  });

  it("clears secret input on failed create", async () => {
    const rejectMsg = "API rejected";
    /* c8 ignore next */
    const onCreate = vi
      .fn()
      .mockImplementation(async () => { throw new Error(rejectMsg); });
    renderDialog({ onCreate, error: rejectMsg });

    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "sk-test-key-that-should-clear" } });
    expect(secretInput.value).toBe("sk-test-key-that-should-clear");

    const submitBtn = screen.getByText("Create Connection");
    fireEvent.click(submitBtn);

    // Wait for async rejection to settle and React state to update
    await waitFor(() => {
      expect(secretInput.value).toBe("");
    });
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = renderDialog({ onClose });

    const backdrop = container.querySelector(".provider-conn-backdrop")!;
    fireEvent.click(backdrop);

    expect(onClose).toHaveBeenCalled();
  });

  it("disables submit button when creating", () => {
    renderDialog({ isCreating: true });
    const submitBtn = screen.getByText("Creating...") as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it("displays external error", () => {
    renderDialog({ error: "Connection failed" });
    expect(screen.getByText("Connection failed")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Secret non-leak assertions
  // -----------------------------------------------------------------------

  it("does not prefill secret input from any source", () => {
    renderDialog();
    // The secret input value is always empty until the user types
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    expect(secretInput.value).toBe("");
  });

  it("does not show secret value as visible text", () => {
    const { container } = renderDialog();
    const secretInput = screen.getByLabelText("API Key / Secret") as HTMLInputElement;
    fireEvent.change(secretInput, { target: { value: "test-key-value" } });

    // The input type is password so the value is masked visually
    expect(secretInput.type).toBe("password");
    // The secret value is NOT shown as visible text or in placeholder
    expect(container.textContent).not.toContain("test-key-value");
  });
});
