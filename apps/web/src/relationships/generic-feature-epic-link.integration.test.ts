// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import type { WorkItemCard } from "@hepha/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiGet: transport.get,
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { useFeatureEpicLink, type FeatureEpicLinkOptions } from "./use-feature-epic-link.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-feature-epic-link.feature"), "utf8");
const item = { externalId: "ITEM / ONE", id: "item" } as WorkItemCard;
const returnedItems = [{ id: "returned" }] as WorkItemCard[];

function options(overrides: Partial<FeatureEpicLinkOptions> = {}): FeatureEpicLinkOptions {
  return { onItems: vi.fn(), onNotice: vi.fn(), projectId: "PROJECT / ONE", ...overrides };
}

beforeEach(() => {
  transport.get.mockReset();
  transport.post.mockReset();
  transport.get.mockResolvedValue({ items: returnedItems });
});

describe("generic feature-to-epic link Gherkin integration", () => {
  it("specifies four product-blind relationship behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it.each([
    ["link", "parent"],
    ["relink", "replacement"],
    ["unlink", undefined],
  ] as const)("maps %s through encoded durable identities", async (operation, targetEpicCardId) => {
    transport.post.mockResolvedValue({ blockers: [], summary: "Relationship updated", warnings: [] });
    const callbacks = options();
    const { result } = renderHook(() => useFeatureEpicLink(callbacks));
    await act(async () => result.current.link(item, operation, targetEpicCardId));
    expect(transport.post).toHaveBeenCalledWith(
      "/api/projects/PROJECT%20%2F%20ONE/features/ITEM%20%2F%20ONE/link-epic",
      { operation, targetEpicCardId },
    );
    expect(transport.get).toHaveBeenCalledWith("/api/projects/PROJECT%20%2F%20ONE/work-items");
    expect(callbacks.onItems).toHaveBeenCalledWith(returnedItems);
    expect(result.current.isLinking).toBe(false);
  });

  it("keeps blockers distinct from successful warning notices", async () => {
    transport.post
      .mockResolvedValueOnce({ blockers: ["Parent invalid", "Cycle detected"], summary: "Blocked", warnings: [] })
      .mockResolvedValueOnce({ blockers: [], summary: "Linked", warnings: ["Review hierarchy"] });
    const callbacks = options();
    const { result } = renderHook(() => useFeatureEpicLink(callbacks));
    await act(async () => result.current.link(item, "link", "parent"));
    expect(result.current.error).toBe("Parent invalid; Cycle detected");
    expect(result.current.result).toBeNull();
    await act(async () => result.current.link(item, "relink", "replacement"));
    expect(result.current.error).toBeNull();
    expect(result.current.result).toBe("Linked");
    expect(callbacks.onNotice).toHaveBeenLastCalledWith("Linked Warnings: Review hierarchy");
  });

  it("reports transport failure and refuses dispatch without a project", async () => {
    transport.post.mockRejectedValueOnce(new Error("Relationship unavailable"));
    const { result } = renderHook(() => useFeatureEpicLink(options()));
    await act(async () => result.current.link(item, "unlink"));
    expect(result.current.error).toBe("Relationship unavailable");
    expect(result.current.isLinking).toBe(false);

    const absent = renderHook(() => useFeatureEpicLink(options({ projectId: null })));
    await act(async () => absent.result.current.link(item, "link", "parent"));
    expect(transport.post).toHaveBeenCalledTimes(1);
  });
});
