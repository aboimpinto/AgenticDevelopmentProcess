import type { StoredDeepDiveSession } from "@hepha/db";
import type { HephaFeatureWorkflowRunner } from "../src/feature-workflow-spec.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { describe, expect, it, vi } from "vitest";
import { DeepDiveCompletionApplication } from "../src/application/deep-dive/deep-dive-completion-application.js";

function session(kind: "feature" | "epic" = "feature"): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: kind === "epic" ? "EPIC-ANY" : "FEAT-ANY",
    cardId: "card",
    cardKey: `${kind}:any`,
    cardKind: kind,
    cardTitle: "Generic work",
    completedAt: null,
    createdAt: "before",
    id: "dd-any",
    originalDocument: "# Before",
    originalDocumentHash: "old",
    originalDocumentPath: "/memory/source.md",
    originalDocumentUpdatedAt: "before",
    projectId: "project-any",
    questions: [{
      answerText: "Chosen",
      chatMessages: [],
      id: "question-any",
      options: [{ description: "Proceed", id: "yes", label: "Yes" }],
      prompt: "Proceed?",
      recommendedOptionId: "yes",
      selectedOptionId: "yes",
      status: "answered",
      topic: "Scope",
    }],
    status: "ready_for_update",
    updatedAt: "before",
  };
}

function harness(initial = session(), options: {
  projectAvailable?: boolean;
  updateError?: Error;
  workflowFailurePersistenceFails?: boolean;
} = {}) {
  let stored = initial;
  const events: string[] = [];
  const phaseNodes: string[] = [];
  const evidence = {
    semanticSource: "semantic",
    sourceDocumentHash: "new-hash",
    sourceDocumentUpdatedAt: "document-time",
  };
  const preparationEvidence = {
    semanticSource: "semantic preparation set",
    sourceDocumentHash: "preparation-set-hash",
    sourceDocumentUpdatedAt: "design-document-time",
  };
  const store = {
    enabled: true,
    getDeepDiveSession: vi.fn(async () => stored),
    recordFeatureWorkflowCompletion: vi.fn(async () => { events.push("workflow-completed"); }),
    recordFeatureWorkflowRun: vi.fn(async () => {
      events.push("workflow-failed");
      if (options.workflowFailurePersistenceFails) throw new Error("store unavailable");
    }),
    recordHephaDeepDive: vi.fn(async () => { events.push("evidence"); }),
    updateDeepDiveSession: vi.fn(async (next: StoredDeepDiveSession) => {
      stored = next;
      events.push(`session:${next.status}`);
      return next;
    }),
  };
  const runner: HephaFeatureWorkflowRunner = {
    async runNode(nodeId, _options, operation) {
      phaseNodes.push(nodeId);
      return operation(
        { id: nodeId, model: "configured-model" } as Parameters<typeof operation>[0],
        { status: nodeId, summary: nodeId },
      );
    },
  };
  const updateDocument = vi.fn(async () => {
    if (options.updateError) throw options.updateError;
    return "# Updated";
  });
  const application = new DeepDiveCompletionApplication({
    clock: () => "completed-time",
    createRunner: vi.fn(() => runner),
    documents: {
      readEvidence: vi.fn(() => evidence),
      readPreparationEvidence: vi.fn(() => preparationEvidence),
      readPreparationSource: vi.fn(() => ({ promptMarkdown: "# Feature\n\n# Design context" } as never)),
      write: vi.fn(() => { events.push("document-written"); }),
    },
    findProject: () => options.projectAvailable !== false
      ? ({ id: "project-any", rootPath: "/project" } as StoredProject)
      : null,
    metadataStore: store,
    notifyChanged: (_projectId, eventType) => events.push(`notify:${eventType}`),
    requireModel: vi.fn(() => "resolved-model"),
    scanProject: vi.fn(async () => [{ kind: "epic", externalId: "EPIC-ANY" } as never]),
    syncEpic: vi.fn(() => { events.push("epic-synced"); }),
    updateDocument,
  });
  return { application, events, phaseNodes, store, updateDocument };
}

describe("deep-dive completion application", () => {
  it("rejects incomplete answers and missing writable source before running workflow nodes", async () => {
    const incomplete = session();
    (incomplete.questions[0] as { status: string }).status = "pending";
    const incompleteHarness = harness(incomplete);
    await expect(incompleteHarness.application.complete(incomplete.id)).rejects.toThrow("All deep-dive questions");
    expect(incompleteHarness.phaseNodes).toEqual([]);

    const detached = session();
    detached.originalDocumentPath = null;
    await expect(harness(detached).application.complete(detached.id)).rejects.toThrow("writable source document");
  });

  it("updates a feature document, records evidence, completes storage, then notifies", async () => {
    const current = harness();
    const result = await current.application.complete("dd-any");

    expect(current.phaseNodes).toEqual(["update-document", "record-completion"]);
    expect(result.status).toBe("completed");
    expect(result.agentConnectionStatus).toBe("finished");
    expect(current.store.recordHephaDeepDive).toHaveBeenCalledWith(expect.objectContaining({
      semanticSource: "semantic preparation set",
      sourceDocumentHash: "preparation-set-hash",
    }));
    expect(current.updateDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ preparationContext: "# Feature\n\n# Design context" }),
    );
    expect(current.events.indexOf("evidence")).toBeLessThan(current.events.indexOf("workflow-completed"));
    expect(current.events.at(-1)).toBe("notify:deep-dive.completed");
  });

  it("synchronizes an EPIC before recording final source evidence", async () => {
    const current = harness(session("epic"));
    await current.application.complete("dd-any");
    expect(current.phaseNodes).toEqual(["update-document", "sync-epic-state", "record-completion"]);
    expect(current.events).toContain("epic-synced");
  });

  it("records failed session state and notification while preserving the original error", async () => {
    const failure = new Error("rewrite failed");
    const current = harness(session(), {
      updateError: failure,
      workflowFailurePersistenceFails: true,
    });
    await expect(current.application.complete("dd-any")).rejects.toBe(failure);
    expect(current.store.updateDeepDiveSession).toHaveBeenLastCalledWith(expect.objectContaining({
      agentConnectionStatus: "lost",
      status: "failed",
    }));
    expect(current.store.recordFeatureWorkflowRun).toHaveBeenCalledWith(expect.objectContaining({
      error: "rewrite failed",
      status: "failed",
    }));
    expect(current.events.at(-1)).toBe("notify:deep-dive.failed");
  });

  it("records answers-ready only when the project still exists", async () => {
    const current = harness();
    await current.application.recordAnswersReady(session());
    expect(current.phaseNodes).toEqual(["answers-ready"]);
    const missing = harness(session(), { projectAvailable: false });
    await missing.application.recordAnswersReady(session());
    expect(missing.phaseNodes).toEqual([]);
  });
});
