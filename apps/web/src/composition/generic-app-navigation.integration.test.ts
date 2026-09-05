// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAppNavigation, type AppNavigationOptions } from "./use-app-navigation.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-app-navigation.feature"), "utf8");

function options(overrides: Partial<AppNavigationOptions> = {}): AppNavigationOptions {
  return {
    closeEpicSubmission: vi.fn(),
    isBladeOpen: false,
    isDeepDiveOpen: false,
    onProjectChanged: vi.fn(),
    openEpicSubmission: vi.fn(),
    openFeatureSubmission: vi.fn(),
    refreshDocument: vi.fn(),
    resetDeepDive: vi.fn(),
    setActiveView: vi.fn(),
    setDocumentDetail: vi.fn(),
    setDocumentDetailLoading: vi.fn(),
    setIsAddingProject: vi.fn(),
    setIsBladeOpen: vi.fn(),
    setIsDetailExpanded: vi.fn(),
    setNoticeMessage: vi.fn(),
    setSelectedItemId: vi.fn(),
    setSelectedProjectId: vi.fn(),
    setSelectedSourceIssueId: vi.fn(),
    ...overrides,
  };
}

describe("generic application navigation Gherkin integration", () => {
  it("specifies four product-blind navigation behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("opens compact and expanded item detail from one transition", () => {
    const callbacks = options();
    const { result } = renderHook(() => useAppNavigation(callbacks));
    act(() => result.current.selectItem("item"));
    expect(callbacks.setDocumentDetail).toHaveBeenCalledWith(null);
    expect(callbacks.setDocumentDetailLoading).toHaveBeenCalledWith(true);
    expect(callbacks.refreshDocument).toHaveBeenCalledOnce();
    expect(callbacks.setSelectedItemId).toHaveBeenCalledWith("item");
    expect(callbacks.setSelectedSourceIssueId).toHaveBeenCalledWith(null);
    expect(callbacks.setIsDetailExpanded).toHaveBeenLastCalledWith(false);
    expect(callbacks.setIsBladeOpen).toHaveBeenLastCalledWith(true);

    act(() => result.current.selectExpandedItem("expanded"));
    expect(callbacks.setSelectedItemId).toHaveBeenLastCalledWith("expanded");
    expect(callbacks.setIsDetailExpanded).toHaveBeenLastCalledWith(true);
  });

  it("resets project-bound surfaces and opens mutually exclusive submissions", () => {
    const callbacks = options();
    const { result } = renderHook(() => useAppNavigation(callbacks));
    act(() => result.current.selectProject("project"));
    expect(callbacks.setSelectedProjectId).toHaveBeenCalledWith("project");
    expect(callbacks.resetDeepDive).toHaveBeenCalledOnce();
    expect(callbacks.closeEpicSubmission).toHaveBeenCalledOnce();
    expect(callbacks.setNoticeMessage).toHaveBeenCalledWith(null);
    expect(callbacks.onProjectChanged).toHaveBeenCalledOnce();

    act(() => result.current.openProjectBoard("project"));
    expect(callbacks.setSelectedProjectId).toHaveBeenLastCalledWith("project");
    expect(callbacks.setActiveView).toHaveBeenCalledWith("work-board");

    act(() => result.current.openSubmitEpicOverlay());
    expect(callbacks.setIsBladeOpen).toHaveBeenLastCalledWith(false);
    expect(callbacks.openEpicSubmission).toHaveBeenCalledOnce();
    act(() => result.current.openSubmitFeatOverlay());
    expect(callbacks.openFeatureSubmission).toHaveBeenCalledOnce();
  });

  it("routes views and source issues through coherent surface state", () => {
    const callbacks = options();
    const { result } = renderHook(() => useAppNavigation(callbacks));
    act(() => result.current.selectSourceIssue("source"));
    expect(callbacks.setSelectedSourceIssueId).toHaveBeenCalledWith("source");
    expect(callbacks.setSelectedItemId).toHaveBeenCalledWith(null);
    expect(callbacks.setIsDetailExpanded).toHaveBeenLastCalledWith(true);

    act(() => result.current.openCompletedFeaturesView());
    expect(callbacks.setActiveView).toHaveBeenCalledWith("completed-features");
    expect(callbacks.setIsBladeOpen).toHaveBeenLastCalledWith(false);
  });

  it("closes detail with Escape only when no higher-priority interaction owns it", () => {
    const setIsBladeOpen = vi.fn();
    const callbacks = options({ isBladeOpen: true, setIsBladeOpen });
    const { rerender } = renderHook(
      ({ values }) => useAppNavigation(values),
      { initialProps: { values: callbacks } },
    );
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    expect(setIsBladeOpen).toHaveBeenCalledWith(false);

    setIsBladeOpen.mockClear();
    rerender({ values: { ...callbacks, isDeepDiveOpen: true } });
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true })));
    expect(setIsBladeOpen).not.toHaveBeenCalled();
  });
});
