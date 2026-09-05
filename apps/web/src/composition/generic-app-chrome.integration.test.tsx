// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProjectSummary } from "@hepha/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConnectionBanner, MemoryBankBanner, NoticeBanner, Sidebar } from "./app-chrome.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-app-chrome.feature"), "utf8");
afterEach(cleanup);

describe("generic application chrome Gherkin integration", () => {
  it("specifies four product-blind frame behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("renders errors and notices through distinct production banners", () => {
    const { rerender } = render(<ConnectionBanner message="offline" />);
    expect(screen.getByText("offline")).toBeDefined();
    rerender(<NoticeBanner message="refreshed" />);
    expect(screen.getByText("refreshed")).toBeDefined();
  });

  it("migrates the primary navigation to Models", () => {
    const onSelectView = vi.fn();
    render(<Sidebar activeView="work-board" onSelectView={onSelectView} />);

    expect(screen.queryByRole("button", { name: "Provider Connections" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Models" }));
    expect(onSelectView).toHaveBeenCalledWith("models");
  });

  it("delegates MemoryBank initialization without owning the operation", () => {
    const onInitialize = vi.fn();
    const project = { id: "project", name: "Project" } as ProjectSummary;
    render(
      <MemoryBankBanner
        isPending={false}
        onInitialize={onInitialize}
        project={project}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Initialize" }));
    expect(onInitialize).toHaveBeenCalledOnce();
  });
});
