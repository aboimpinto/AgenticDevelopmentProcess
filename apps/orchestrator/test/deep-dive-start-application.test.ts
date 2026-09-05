import type { StoredDeepDiveSession } from "@hepha/db";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  DeepDiveStartApplication,
  type DeepDiveStartDependencies,
} from "../src/application/deep-dive/deep-dive-start-application.js";
import type { HephaFeatureWorkflowRunner } from "../src/feature-workflow-spec.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import type { DeepDivePreparationSource } from "../src/application/deep-dive/deep-dive-preparation-source.js";

const project = {
  id: "project-any",
  rootPath: "/project",
} as StoredProject;
const item = {
  documentPath: "/project/MemoryBank/source.md",
  documentUpdatedAt: "document-time",
  epicState: null,
  externalId: "ITEM-ANY",
  folderName: "item-any",
  id: "card-any",
  kind: "feature",
  specMarkdown: "# Generic capability",
  stateFolder: "01_SUBMITTED",
  title: "Generic capability",
} as WorkItemCard;

function storedSession(overrides: Partial<StoredDeepDiveSession> = {}): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: item.externalId,
    cardId: item.id,
    cardKey: "feature:ITEM-ANY",
    cardKind: "feature",
    cardTitle: item.title,
    completedAt: null,
    createdAt: "clock-time",
    id: "workflow-run-any",
    originalDocument: item.specMarkdown,
    originalDocumentHash: "source-hash",
    originalDocumentPath: item.documentPath,
    originalDocumentUpdatedAt: item.documentUpdatedAt,
    projectId: project.id,
    questions: [],
    status: "generating_questions",
    updatedAt: "clock-time",
    ...overrides,
  };
}

function harness(options: {
  existing?: StoredDeepDiveSession | null;
  planError?: Error;
  preparationSource?: DeepDivePreparationSource;
  projectAvailable?: boolean;
} = {}) {
  let stored = options.existing ?? null;
  const events: string[] = [];
  const nodes: string[] = [];
  const runner: HephaFeatureWorkflowRunner = {
    async runNode(nodeId, _options, operation) {
      nodes.push(nodeId);
      return operation(
        { id: nodeId, model: "configured-model" } as Parameters<typeof operation>[0],
        { status: nodeId, summary: nodeId },
      );
    },
  };
  const question: DeepDiveQuestion = {
    answerText: null,
    chatMessages: [],
    id: "question-any",
    options: [{ description: "Proceed", id: "proceed", label: "Proceed" }],
    prompt: "Proceed?",
    recommendedOptionId: "proceed",
    selectedOptionId: null,
    status: "pending",
    topic: "Scope",
  };
  const store = {
    enabled: true,
    createDeepDiveSession: vi.fn(async (session: StoredDeepDiveSession) => {
      stored = session;
      events.push(`create:${session.status}`);
      return session;
    }),
    findOpenDeepDiveSession: vi.fn(async () => options.existing ?? null),
    getDeepDiveSession: vi.fn(async () => stored),
    recordFeatureWorkflowRun: vi.fn(async (record: { status: string }) => {
      events.push(`run:${record.status}`);
    }),
    updateDeepDiveSession: vi.fn(async (session: StoredDeepDiveSession) => {
      stored = session;
      events.push(`update:${session.status}`);
      return session;
    }),
  };
  const dependencies: DeepDiveStartDependencies = {
    clock: () => "clock-time",
    createCardKey: (kind, externalId) => `${kind}:${externalId.toUpperCase()}`,
    createId: () => "run-any",
    createRunner: vi.fn(() => runner),
    findProject: () => options.projectAvailable === false ? null : project,
    hashText: () => "source-hash",
    notifyChanged: (_projectId, eventType) => events.push(`notify:${eventType}`),
    planQuestions: vi.fn(async () => {
      if (options.planError) throw options.planError;
      return [question];
    }),
    ...(options.preparationSource
      ? { readPreparationSource: vi.fn(() => options.preparationSource!) }
      : {}),
    requireModel: vi.fn(() => handoffPlan("resolved-model")),
    scanProject: vi.fn(async () => [item]),
    store: store as unknown as DeepDiveStartDependencies["store"],
  };
  return { application: new DeepDiveStartApplication(dependencies), dependencies, events, nodes, store };
}

describe("deep-dive start application", () => {
  it("rejects an unknown project before scanning work items", async () => {
    const current = harness({ projectAvailable: false });
    await expect(current.application.start({ cardId: item.id, projectId: project.id })).rejects.toThrow("Project not found");
    expect(current.dependencies.scanProject).not.toHaveBeenCalled();
  });

  it("returns an existing open session without creating another workflow", async () => {
    const existing = storedSession({ id: "existing-session", status: "question_round" });
    const current = harness({ existing });
    const result = await current.application.start({ cardId: item.id, projectId: project.id });
    expect(result.id).toBe("existing-session");
    expect(current.store.createDeepDiveSession).not.toHaveBeenCalled();
    expect(current.dependencies.createRunner).not.toHaveBeenCalled();
  });

  it("creates recovery sessions directly in the question round without model generation", async () => {
    const current = harness();
    const result = await current.application.start(
      { cardId: item.id, projectId: project.id },
      { prompt: "Confirm the current source.", topic: "Stale source" },
    );

    expect(result.status).toBe("question_round");
    expect(result.questions).toHaveLength(1);
    expect(current.dependencies.createRunner).not.toHaveBeenCalled();
    expect(current.events).toEqual([
      "create:question_round",
      "run:running",
      "notify:deep-dive.started",
    ]);
  });

  it("runs the ordered question workflow and persists a ready question round", async () => {
    const current = harness();
    const session = storedSession();
    await current.store.createDeepDiveSession(session);

    await current.application.generateQuestions({
      cardKey: session.cardKey,
      command: "deep-dive-feature",
      item,
      project,
      runId: session.id,
    });

    expect(current.nodes).toEqual(["create-session", "generate-questions", "wait-for-answers"]);
    expect(current.dependencies.requireModel).toHaveBeenCalledWith(
      undefined,
      "deep-dive-feature generate-questions node",
    );
    expect(current.dependencies.planQuestions).toHaveBeenCalledWith(
      project,
      item,
      expect.objectContaining({ plan: handoffPlan("resolved-model") }),
    );
    expect(current.store.updateDeepDiveSession).toHaveBeenCalledWith(expect.objectContaining({
      agentConnectionStatus: "finished",
      status: "question_round",
    }));
    expect(current.events.at(-1)).toBe("notify:deep-dive.questions-ready");
  });

  it("starts a feature session from the complete authoritative preparation source", async () => {
    const preparationSource = {
      documents: [{ fileName: "design.md" }],
      promptMarkdown: "# Feature\n\n# Design questions",
      semanticSource: "semantic preparation set",
      sourceHash: "preparation-set-hash",
      sourceUpdatedAt: "design-time",
    } as unknown as DeepDivePreparationSource;
    const current = harness({ preparationSource });

    await current.application.start({ cardId: item.id, projectId: project.id });

    expect(current.store.createDeepDiveSession).toHaveBeenCalledWith(expect.objectContaining({
      originalDocumentHash: "preparation-set-hash",
      originalDocumentUpdatedAt: "design-time",
    }));
    expect(current.dependencies.planQuestions).toHaveBeenCalledWith(
      project,
      item,
      expect.objectContaining({ preparationSource }),
    );
  });

  it("contains generation failure, marks durable state failed, and notifies", async () => {
    const current = harness({ planError: new Error("planner unavailable") });
    const session = storedSession();
    await current.store.createDeepDiveSession(session);

    await current.application.generateQuestions({
      cardKey: session.cardKey,
      command: "deep-dive-feature",
      item,
      project,
      runId: session.id,
    });

    expect(current.store.updateDeepDiveSession).toHaveBeenCalledWith(expect.objectContaining({
      agentConnectionStatus: "lost",
      status: "failed",
    }));
    expect(current.store.recordFeatureWorkflowRun).toHaveBeenLastCalledWith(expect.objectContaining({
      error: "planner unavailable",
      status: "failed",
    }));
    expect(current.events.at(-1)).toBe("notify:deep-dive.failed");
  });
});
