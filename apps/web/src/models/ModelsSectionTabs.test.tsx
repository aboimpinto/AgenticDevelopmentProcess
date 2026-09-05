// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModelsSectionTabs } from "./ModelsSectionTabs.js";

afterEach(cleanup);

describe("ModelsSectionTabs", () => {
  it("exposes one selected tab and activates tabs by click", () => {
    const onSelectSection = vi.fn();
    render(<ModelsSectionTabs onSelectSection={onSelectSection} selectedSection="available-models" />);

    expect(screen.getByRole("tab", { name: "Available Models" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Provider Connections" }).tabIndex).toBe(-1);
    fireEvent.click(screen.getByRole("tab", { name: "Routing Defaults" }));
    expect(onSelectSection).toHaveBeenCalledWith("routing-defaults");
  });

  it("moves focus with arrows, Home, and End without changing selection", () => {
    const onSelectSection = vi.fn();
    render(<ModelsSectionTabs onSelectSection={onSelectSection} selectedSection="available-models" />);
    const provider = screen.getByRole("tab", { name: "Provider Connections" });
    const available = screen.getByRole("tab", { name: "Available Models" });
    const routing = screen.getByRole("tab", { name: "Routing Defaults" });

    available.focus();
    fireEvent.keyDown(available, { key: "ArrowRight" });
    expect(document.activeElement).toBe(routing);
    fireEvent.keyDown(routing, { key: "ArrowRight" });
    expect(document.activeElement).toBe(provider);
    fireEvent.keyDown(provider, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(routing);
    fireEvent.keyDown(routing, { key: "Home" });
    expect(document.activeElement).toBe(provider);
    fireEvent.keyDown(provider, { key: "End" });
    expect(document.activeElement).toBe(routing);
    expect(onSelectSection).not.toHaveBeenCalled();
  });

  it("activates the focused section with Enter or Space", () => {
    const onSelectSection = vi.fn();
    render(<ModelsSectionTabs onSelectSection={onSelectSection} selectedSection="available-models" />);
    const routing = screen.getByRole("tab", { name: "Routing Defaults" });

    fireEvent.keyDown(routing, { key: "Enter" });
    fireEvent.keyDown(routing, { key: " " });
    expect(onSelectSection).toHaveBeenNthCalledWith(1, "routing-defaults");
    expect(onSelectSection).toHaveBeenNthCalledWith(2, "routing-defaults");
  });
});
