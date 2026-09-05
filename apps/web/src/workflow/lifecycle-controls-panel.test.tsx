/**
 * Tests for LifecycleControlsPanel.
 */

import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { LifecycleControlsPanel } from "./lifecycle-controls-panel.js";
import type { WorkflowActionDescriptor } from "./types.js";

function makeAction(overrides?: Partial<WorkflowActionDescriptor>): WorkflowActionDescriptor {
  return {
    id: "start-implementing",
    label: "Start Implementing",
    available: true,
    busy: false,
    reason: null,
    group: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe("LifecycleControlsPanel", () => {
  it("returns null when no actions are available and none are busy", () => {
    const { container } = render(
      <LifecycleControlsPanel
        actions={[makeAction({ available: false, busy: false })]}
        onAction={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders available action buttons", () => {
    const actions = [
      makeAction({ id: "start-implementing", label: "Start Implementing", available: true }),
      makeAction({ id: "complete-feature", label: "Complete Feature", available: false }),
    ];
    render(<LifecycleControlsPanel actions={actions} onAction={vi.fn()} />);
    expect(screen.getByText("Start Implementing")).toBeDefined();
    expect(screen.getByText("Complete Feature")).toBeDefined();
    expect(screen.getByText("Start Implementing")).toBeInstanceOf(HTMLButtonElement);
  });

  it("disables non-available actions", () => {
    const actions = [
      makeAction({ id: "start-implementing", label: "Start Implementing", available: true }),
      makeAction({ id: "complete-feature", label: "Complete Feature", available: false }),
    ];
    render(<LifecycleControlsPanel actions={actions} onAction={vi.fn()} />);
    const button = screen.getByText("Complete Feature") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("calls onAction when clicked", () => {
    const onAction = vi.fn();
    const actions = [makeAction({ id: "complete-feature", label: "Complete Feature", available: true })];
    const { container } = render(<LifecycleControlsPanel actions={actions} onAction={onAction} />);
    const button = container.querySelector("button");
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onAction).toHaveBeenCalledWith("complete-feature");
  });

  it("renders a completed action as a disabled success control", () => {
    render(<LifecycleControlsPanel actions={[makeAction({ available: false, completed: true, label: "User Code Review Complete" })]} onAction={vi.fn()} />);
    const button = screen.getByRole("button", { name: "User Code Review Complete" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.className).toContain("validation-action-complete");
  });

  it("shows reasons for disabled actions", () => {
    const actions = [
      makeAction({ id: "start-implementing", label: "Start Implementing", available: true }),
      makeAction({ id: "complete-feature", label: "Complete Feature", available: false, reason: "Deep-dive required" }),
    ];
    render(<LifecycleControlsPanel actions={actions} onAction={vi.fn()} />);
    expect(screen.getByText("Deep-dive required")).toBeDefined();
  });
});
