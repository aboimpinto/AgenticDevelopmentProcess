import type { StoredFeatureFinding } from "@hepha/db";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { FeatureFindingExecutionApplication } from "../src/application/features/feature-finding-execution-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

function harness(options: { appendError?: Error; missingFinding?: boolean; missingFeature?: boolean; workerError?: Error } = {}) {
  const feature = { externalId: "ITEM-ANY", kind: "feature", title: "Capability" } as WorkItemCard;
  const finding = { id: "finding-any", title: "Observed behavior", events: [] } as unknown as StoredFeatureFinding;
  const phase = { fileName: "human-review.md", number: 9, path: "/phase.md" };
  const project = { id: "project", name: "Project", rootPath: "/project" } as StoredProject;
  const dependencies = {
    appendAgentResult: vi.fn(() => { if (options.appendError) throw options.appendError; }),
    buildPrompt: vi.fn(() => "finding prompt"),
    chooseModel: vi.fn(() => handoffPlan("review-model")),
    clock: vi.fn(() => "2026-01-01T00:00:00.000Z"),
    collectContext: vi.fn(() => "finding context"),
    createId: vi.fn(() => "event-any"),
    ensurePhase: vi.fn(() => phase),
    metadataStore: {
      getFeatureFinding: vi.fn(async () => options.missingFinding ? null : finding),
      recordFeatureFindingAgentRun: vi.fn(async () => undefined),
    },
    notifyChanged: vi.fn(),
    reportDocumentFailure: vi.fn(),
    scanProject: vi.fn(async () => options.missingFeature ? [] : [feature]),
    summarizeOutput: vi.fn(() => "bounded response"),
    worker: {
      execute: vi.fn(async () => {
        if (options.workerError) throw options.workerError;
        return "fixed output";
      }),
    },
  };
  return {
    application: new FeatureFindingExecutionApplication(dependencies),
    dependencies,
    input: { cardKey: "feature:item-any", featureExternalId: "ITEM-ANY", findingId: "finding-any", project, runId: "run-any" },
  };
}

describe("Feature finding execution application", () => {
  it("runs one finding repair and records its response for user verification", async () => {
    const current = harness();
    await current.application.execute(current.input);
    expect(current.dependencies.metadataStore.recordFeatureFindingAgentRun).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ currentStep: "Analyzing user finding and applying scoped fix", status: "agent_running" }),
    );
    expect(current.dependencies.collectContext).toHaveBeenCalledWith(
      current.input.project,
      expect.objectContaining({ externalId: "ITEM-ANY" }),
      [expect.objectContaining({ externalId: "ITEM-ANY" })],
      expect.objectContaining({ number: 9 }),
    );
    expect(current.dependencies.worker.execute).toHaveBeenCalledWith(expect.objectContaining({
      agentRole: "human-review-finding",
      plan: handoffPlan("review-model"),
      prompt: "finding prompt",
    }));
    expect(current.dependencies.appendAgentResult).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "ITEM-ANY" }),
      "finding-any",
      "fixed output",
      "AWAITING_USER_ACCEPTANCE",
    );
    expect(current.dependencies.metadataStore.recordFeatureFindingAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "agent_response", summary: "bounded response" }),
    );
    expect(current.dependencies.notifyChanged).toHaveBeenLastCalledWith("project", "finding.agent-response", "ITEM-ANY");
  });

  it("records disappeared finding context as an open durable failure", async () => {
    const current = harness({ missingFinding: true });
    await current.application.execute(current.input);
    expect(current.dependencies.worker.execute).not.toHaveBeenCalled();
    expect(current.dependencies.appendAgentResult).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: "ITEM-ANY" }),
      "finding-any",
      expect.stringContaining("Finding context disappeared"),
      "IN_PROGRESS",
    );
    expect(current.dependencies.metadataStore.recordFeatureFindingAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: "Finding context disappeared before the agent could run.", status: "open" }),
    );
  });

  it("contains worker and phase-document failures while preserving database recovery state", async () => {
    const current = harness({ appendError: new Error("document unavailable"), workerError: new Error("provider unavailable") });
    await expect(current.application.execute(current.input)).resolves.toBeUndefined();
    expect(current.dependencies.reportDocumentFailure).toHaveBeenCalledWith("ITEM-ANY", expect.any(Error));
    expect(current.dependencies.metadataStore.recordFeatureFindingAgentRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ error: "provider unavailable", status: "open", summary: "Finding agent failed." }),
    );
    expect(current.dependencies.notifyChanged).toHaveBeenLastCalledWith("project", "finding.failed", "ITEM-ANY");
  });
});
