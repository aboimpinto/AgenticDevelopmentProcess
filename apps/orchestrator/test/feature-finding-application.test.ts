import type { CardMetadataStore, StoredFeatureFinding } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  FeatureFindingApplication,
  createFindingTitle,
  normalizeFindingContent,
  type HumanReviewFindingPhaseRef,
} from "../src/application/features/feature-finding-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const project = { id: "project" } as StoredProject;
const feature = { id: "card", externalId: "WORK", kind: "feature" } as WorkItemCard;
const phase = { fileName: "review.md", number: 4, path: "/review.md" };

function finding(status: StoredFeatureFinding["status"]): StoredFeatureFinding {
  return { id: "finding-one", status } as StoredFeatureFinding;
}

function harness(options: {
  completion?: boolean;
  enabled?: boolean;
  found?: StoredFeatureFinding | null;
  listed?: StoredFeatureFinding[];
  phase?: HumanReviewFindingPhaseRef | null;
  resolved?: boolean;
  waiting?: boolean;
} = {}) {
  const metadataStore = {
    enabled: options.enabled ?? true,
    appendFeatureFindingDetail: vi.fn(async () => finding("agent_running")),
    closeFeatureFinding: vi.fn(async () => finding("closed")),
    createFeatureFinding: vi.fn(async () => finding("agent_running")),
    getFeatureFinding: vi.fn(async () => options.found === undefined ? finding("awaiting_user") : options.found),
    listFeatureFindings: vi.fn(async () => new Map([["feature:WORK", options.listed ?? []]])),
    recordFeatureFindingAgentRun: vi.fn(async () => undefined),
  } as unknown as CardMetadataStore;
  let nextId = 0;
  const dependencies = {
    acceptPhase: vi.fn(),
    allPhasesResolved: vi.fn(() => options.resolved ?? true),
    appendDetail: vi.fn(),
    appendFinding: vi.fn(),
    clock: () => "2026-07-21T00:00:00.000Z",
    createCardKey: () => "feature:WORK",
    createId: () => String(++nextId),
    ensureFindingPhase: vi.fn(() => phase),
    ensureTaskChecklists: vi.fn(),
    executeFinding: vi.fn(async () => undefined),
    findFindingPhase: vi.fn(() => options.phase === undefined ? phase : options.phase),
    isPhaseAwaitingUser: vi.fn(() => options.waiting ?? true),
    markFindingSolved: vi.fn(),
    metadataStore,
    notifyChanged: vi.fn(),
    resolveImplementation: vi.fn(async () => ({ feature, project })),
    scanProject: vi.fn(async () => [feature]),
    startCompletion: vi.fn(async () => options.completion ?? false),
    toProjectSummary: vi.fn(() => ({ id: "project" } as never)),
  };
  return { application: new FeatureFindingApplication(dependencies), dependencies, metadataStore };
}

describe("feature finding application", () => {
  it("normalizes, persists, documents, and dispatches a new finding", async () => {
    const target = harness();
    const result = await target.application.submit({ projectId: "project", cardId: "card", content: "  Broken behavior  " });
    expect(target.metadataStore.createFeatureFinding).toHaveBeenCalledWith(expect.objectContaining({
      cardKey: "feature:WORK", content: "Broken behavior", findingId: "finding-1", title: "Broken behavior",
    }));
    expect(target.dependencies.appendFinding).toHaveBeenCalledWith(phase, expect.objectContaining({ findingId: "finding-1" }));
    expect(target.dependencies.executeFinding).toHaveBeenCalledWith(expect.objectContaining({ findingId: "finding-1", runId: "finding-2" }));
    expect(result.summary).toMatch(/preparing a fix attempt/);
  });

  it("adds detail only to an existing non-running open finding", async () => {
    const target = harness({ found: finding("awaiting_user") });
    await target.application.addDetail({ projectId: "project", cardId: "card", findingId: "finding-one", content: "More detail" });
    expect(target.metadataStore.appendFeatureFindingDetail).toHaveBeenCalledOnce();
    expect(target.dependencies.appendDetail).toHaveBeenCalledOnce();
    await expect(harness({ found: null }).application.addDetail({ projectId: "project", cardId: "card", findingId: "x", content: "More detail" })).rejects.toThrow("Finding not found.");
    await expect(harness({ found: finding("closed") }).application.addDetail({ projectId: "project", cardId: "card", findingId: "x", content: "More detail" })).rejects.toThrow(/already closed/);
    await expect(harness({ found: finding("agent_running") }).application.addDetail({ projectId: "project", cardId: "card", findingId: "x", content: "More detail" })).rejects.toThrow(/run in progress/);
  });

  it("lets only the user-facing command close a settled finding before completion", async () => {
    const target = harness({ completion: true });
    const result = await target.application.resolve({ projectId: "project", cardId: "card", findingId: "finding-one" });
    expect(target.metadataStore.closeFeatureFinding).toHaveBeenCalledOnce();
    expect(target.dependencies.markFindingSolved).toHaveBeenCalledWith(project, feature, "finding-one");
    expect(target.dependencies.startCompletion).toHaveBeenCalledAfter(target.metadataStore.closeFeatureFinding as never);
    expect(result.summary).toMatch(/finalization started/);
    await expect(harness({ found: finding("agent_running") }).application.resolve({ projectId: "project", cardId: "card", findingId: "finding-one" })).rejects.toThrow(/Wait for the current/);
  });

  it("accepts an awaiting-user findings phase only after no agent is running", async () => {
    const open = finding("awaiting_user");
    const target = harness({ listed: [open] });
    const result = await target.application.acceptPhase({ projectId: "project", cardId: "card" });
    expect(target.metadataStore.closeFeatureFinding).toHaveBeenCalledWith(expect.objectContaining({ findingId: "finding-one" }));
    expect(target.dependencies.acceptPhase).toHaveBeenCalledWith(feature, phase);
    expect(result.filesChanged).toEqual(["/review.md"]);
    await expect(harness({ phase: null }).application.acceptPhase({ projectId: "project", cardId: "card" })).rejects.toThrow(/No Human Review Findings/);
    await expect(harness({ waiting: false }).application.acceptPhase({ projectId: "project", cardId: "card" })).rejects.toThrow(/awaiting user acceptance/);
    await expect(harness({ listed: [finding("agent_running")] }).application.acceptPhase({ projectId: "project", cardId: "card" })).rejects.toThrow(/still has an agent run/);
  });

  it("rejects unavailable storage, unresolved work, and insufficient detail", async () => {
    await expect(harness({ enabled: false }).application.submit({ projectId: "project", cardId: "card", content: "Enough" })).rejects.toThrow(/SQLite metadata/);
    await expect(harness({ resolved: false }).application.submit({ projectId: "project", cardId: "card", content: "Enough" })).rejects.toThrow(/every numbered phase/);
    expect(() => normalizeFindingContent(" no ")).toThrow(/enough detail/);
    expect(createFindingTitle("x".repeat(100))).toHaveLength(94);
  });
});
