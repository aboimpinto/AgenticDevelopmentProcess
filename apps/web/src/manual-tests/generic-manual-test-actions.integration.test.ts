import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkItemCard } from "@hepha/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../api/http-client.js", () => ({
  apiGet: transport.get,
  apiPost: transport.post,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown failure",
}));

import { manualTestApi } from "./manual-test-api.js";
import { useManualTestActions, type ManualTestActionOptions } from "./use-manual-test-actions.js";

const specification = readFileSync(resolve(import.meta.dirname, "generic-manual-test-actions.feature"), "utf8");
const item = { id: "item" } as WorkItemCard;

function options(overrides: Partial<ManualTestActionOptions> = {}): ManualTestActionOptions {
  return {
    onError: vi.fn(),
    onNotice: vi.fn(),
    onPendingAction: vi.fn(),
    projectId: "project",
    refreshWorkItems: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => {
  transport.get.mockReset();
  transport.post.mockReset();
  transport.get.mockResolvedValue({ status: "ready" });
  transport.post.mockResolvedValue({ message: "Evidence recorded" });
});

describe("generic manual-test action Gherkin integration", () => {
  it("specifies four product-blind action behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("maps pack generation, review, result, and status to their exact transport contracts", async () => {
    await manualTestApi.generate("project", "item");
    await manualTestApi.review("project", "item", "pack");
    await manualTestApi.record("project", "item", "pack", "review", "test", "pass", "observed", "note");
    await manualTestApi.record("project", "item", "pack", "review", undefined, "fail");
    await manualTestApi.status("project / one", "item/two");

    expect(transport.post).toHaveBeenNthCalledWith(
      1,
      "/api/manual-test-verification/generate",
      { cardId: "item", projectId: "project" },
    );
    expect(transport.post).toHaveBeenNthCalledWith(
      2,
      "/api/manual-test-verification/review",
      { cardId: "item", packId: "pack", projectId: "project" },
    );
    expect(transport.post).toHaveBeenNthCalledWith(
      3,
      "/api/manual-test-verification/record-pass",
      {
        actualResult: "observed",
        cardId: "item",
        notes: "note",
        packId: "pack",
        projectId: "project",
        result: "pass",
        reviewId: "review",
        testId: "test",
      },
    );
    expect(transport.post).toHaveBeenNthCalledWith(
      4,
      "/api/manual-test-verification/record-fail",
      {
        actualResult: null,
        cardId: "item",
        notes: null,
        packId: "pack",
        projectId: "project",
        result: "fail",
        reviewId: "review",
        testId: undefined,
      },
    );
    expect(transport.get).toHaveBeenCalledWith(
      "/api/manual-test-verification/status?projectId=project%20%2F%20one&cardId=item%2Ftwo",
    );
  });

  it("reconciles successful commands and always clears pending state", async () => {
    const callbacks = options();
    await useManualTestActions(callbacks).generate(item);
    expect(callbacks.onPendingAction).toHaveBeenNthCalledWith(1, "manual-test-generate-item");
    expect(callbacks.onNotice).toHaveBeenNthCalledWith(1, null);
    expect(callbacks.onNotice).toHaveBeenLastCalledWith("Evidence recorded");
    expect(callbacks.onError).toHaveBeenCalledWith(null);
    expect(callbacks.refreshWorkItems).toHaveBeenCalledWith("project");
    expect(callbacks.onPendingAction).toHaveBeenLastCalledWith(null);
  });

  it("preserves review/result evidence and reports recoverable failures", async () => {
    const callbacks = options();
    const controller = useManualTestActions(callbacks);
    await controller.review(item, "pack");
    await controller.record(item, "pack", "review", "test", "pass", "observed", "note");
    transport.post.mockRejectedValueOnce(new Error("Verification unavailable"));
    await expect(controller.record(item, "pack", "review", undefined, "fail")).rejects.toThrow(
      "Verification unavailable",
    );

    expect(callbacks.onPendingAction).toHaveBeenCalledWith("manual-test-review-item");
    expect(callbacks.onPendingAction).toHaveBeenCalledWith("manual-test-pass-item");
    expect(callbacks.onPendingAction).toHaveBeenCalledWith("manual-test-fail-item");
    expect(callbacks.onError).toHaveBeenLastCalledWith("Verification unavailable");
    expect(callbacks.onPendingAction).toHaveBeenLastCalledWith(null);
  });

  it("returns null for unavailable status and dispatches nothing without a project", async () => {
    transport.get.mockRejectedValueOnce(new Error("Status unavailable"));
    expect(await useManualTestActions(options()).status(item)).toBeNull();
    const controller = useManualTestActions(options({ projectId: null }));
    await controller.generate(item);
    expect(await controller.status(item)).toBeNull();
    expect(transport.post).not.toHaveBeenCalled();
    expect(transport.get).toHaveBeenCalledTimes(1);
  });
});
