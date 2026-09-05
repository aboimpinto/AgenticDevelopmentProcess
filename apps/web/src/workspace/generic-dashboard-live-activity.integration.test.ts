// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import type { LiveActivityCallbacks } from "../use-live-activity.js";
import type { LiveActivityEvent } from "@hepha/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const liveActivityMock = vi.hoisted(() => ({ callbacks: null as LiveActivityCallbacks | null }));

vi.mock("../use-live-activity.js", () => ({
  useLiveActivity: (_projectId: string | null, _cursor: string | null, callbacks: LiveActivityCallbacks) => {
    liveActivityMock.callbacks = callbacks;
    return {
      isActive: true,
      status: {
        connectionState: "live",
        errorMessage: null,
        isReplayUnavailable: false,
        lastEventTimestamp: null,
        lastPhaseCursor: null,
      },
    };
  },
}));

import { useDashboardLiveActivity } from "./use-dashboard-live-activity.js";

const specification = readFileSync(
  resolve(import.meta.dirname, "generic-dashboard-live-activity.feature"),
  "utf8",
);

function event(overrides: Partial<LiveActivityEvent> = {}): LiveActivityEvent {
  return {
    category: "job",
    id: "event",
    occurredAt: "2026-01-01T00:00:00.000Z",
    projectId: "project",
    replayable: false,
    summary: "Activity needs attention",
    type: "job.updated",
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  liveActivityMock.callbacks = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderController(overrides: Partial<Parameters<typeof useDashboardLiveActivity>[0]> = {}) {
  const options: Parameters<typeof useDashboardLiveActivity>[0] = {
    onDocumentChanged: vi.fn(),
    onError: vi.fn(),
    projectId: "project",
    refreshWorkItems: vi.fn().mockResolvedValue(undefined),
    selectedItemId: "selected-item",
    ...overrides,
  };
  const hook = renderHook(() => useDashboardLiveActivity(options));
  return { ...hook, options };
}

describe("generic dashboard live-activity Gherkin integration", () => {
  it("specifies four product-blind event behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("coalesces repeated file changes into one refresh", async () => {
    const { options } = renderController();
    act(() => {
      liveActivityMock.callbacks?.onEvent?.(event({ category: "file-change" }));
      liveActivityMock.callbacks?.onEvent?.(event({ category: "file-change" }));
      vi.advanceTimersByTime(300);
    });
    await act(async () => Promise.resolve());
    expect(options.refreshWorkItems).toHaveBeenCalledOnce();
  });

  it("refreshes detail and work items for the selected phase event", async () => {
    const { options } = renderController();
    act(() => {
      liveActivityMock.callbacks?.onEvent?.(event({ category: "phase", cardId: "selected-item" }));
    });
    await act(async () => Promise.resolve());
    expect(options.onDocumentChanged).toHaveBeenCalledOnce();
    expect(options.refreshWorkItems).toHaveBeenCalledWith("project");
  });

  it("announces attention and clears the matching summary", async () => {
    const { result } = renderController();
    act(() => {
      liveActivityMock.callbacks?.onEvent?.(event({ category: "question", type: "workflow.failed" }));
    });
    expect(result.current.announcement).toBe("Activity needs attention");
    act(() => vi.advanceTimersByTime(8000));
    expect(result.current.announcement).toBeNull();
  });

  it("reports refresh failures through the caller error boundary", async () => {
    const refreshWorkItems = vi.fn().mockRejectedValue(new Error("Refresh unavailable"));
    const onError = vi.fn();
    renderController({ onError, refreshWorkItems });
    act(() => {
      liveActivityMock.callbacks?.onEvent?.(event({ category: "phase" }));
    });
    await act(async () => Promise.resolve());
    expect(onError).toHaveBeenCalledWith("Refresh unavailable");
  });
});
