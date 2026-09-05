import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { PreviousWorkflowFailureBriefResolver } from "../src/workflows/recovery/previous-workflow-failure-brief-resolver.js";

function feature(lastRun: Record<string, unknown> | null): WorkItemCard {
  return {
    externalId: "FEAT-ANY",
    featureWorkflow: lastRun ? { lastRun } : undefined,
  } as WorkItemCard;
}

function harness(superseded = false) {
  const presenter = { compact: vi.fn(() => "compacted"), create: vi.fn(() => "created") };
  const resolver = new PreviousWorkflowFailureBriefResolver({
    isSupersededByApproval: () => superseded,
    presenter,
  });
  return { presenter, resolver };
}

const failedRun = {
  command: "continue-implementing",
  currentStep: "Current phase",
  error: "raw failure",
  runId: "workflow-any",
  status: "failed",
  summary: null,
};

describe("previous workflow failure brief resolver", () => {
  it("returns no brief when no failed run exists", () => {
    const current = harness();
    expect(current.resolver.resolve(feature(null))).toBeNull();
    expect(current.resolver.resolve(feature({ ...failedRun, status: "completed" }))).toBeNull();
  });

  it("compacts an existing persistent brief unless approval superseded it", () => {
    const persisted = feature({
      ...failedRun,
      summary: "## Previous Workflow Failure Brief\n\nOld detail",
    });
    const current = harness();
    expect(current.resolver.resolve(persisted)).toBe("compacted");
    expect(current.presenter.compact).toHaveBeenCalled();
    expect(harness(true).resolver.resolve(persisted)).toBeNull();
  });

  it("wraps a stored summary when no raw error exists", () => {
    const current = harness();
    expect(current.resolver.resolve(feature({ ...failedRun, error: null, summary: "Concise failure" }))).toBe(
      "## Previous Workflow Failure Brief\n\nConcise failure",
    );
  });

  it("creates a brief from authoritative raw failure unless approval superseded it", () => {
    const current = harness();
    expect(current.resolver.resolve(feature(failedRun))).toBe("created");
    expect(current.presenter.create).toHaveBeenCalledWith(expect.objectContaining({
      rawError: "raw failure",
      runId: "workflow-any",
    }));
    expect(harness(true).resolver.resolve(feature(failedRun))).toBeNull();
  });
});
