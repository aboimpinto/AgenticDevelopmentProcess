import type { DeepDiveQuestion, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { RefinementDeepDiveHandoffApplication } from "../src/application/deep-dive/refinement-deep-dive-handoff-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const question: DeepDiveQuestion = {
  answerText: null,
  chatMessages: [],
  id: "q-1",
  options: [
    { id: "a", label: "A", description: "Choose A" },
    { id: "b", label: "B", description: "Choose B" },
    { id: "c", label: "C", description: "Choose C" },
  ],
  prompt: "Which boundary applies?",
  recommendedOptionId: "a",
  selectedOptionId: null,
  status: "pending",
  topic: "Boundary",
};

function harness(openSession: object | null = null) {
  const store = {
    createDeepDiveSession: vi.fn(async (session) => session),
    findOpenDeepDiveSession: vi.fn(async () => openSession),
  };
  return {
    application: new RefinementDeepDiveHandoffApplication({
      clock: () => "2030-01-01T00:00:00.000Z",
      createId: () => "deep-dive-id",
      hashText: () => "source-hash",
      store: store as never,
    }),
    store,
  };
}

const feature = {
  documentPath: "/memory/FeatureDescription.md",
  documentUpdatedAt: "2029-12-31T00:00:00.000Z",
  externalId: "WORK-ANY",
  folderName: "work-any",
  id: "card-any",
  kind: "feature",
  specMarkdown: "# Work",
  title: "Arbitrary work",
} as WorkItemCard;
const project = { id: "project-any" } as StoredProject;

describe("refinement Deep-Dive handoff application", () => {
  it("creates a question-round session that the existing answer and free-text chat APIs can consume", async () => {
    const current = harness();
    await current.application.create({ cardKey: "feature:work-any", feature, project, questions: [question] });
    expect(current.store.createDeepDiveSession).toHaveBeenCalledWith(expect.objectContaining({
      agentConnectionStatus: "finished",
      id: "workflow-deep-dive-id",
      originalDocument: "# Work",
      originalDocumentHash: "source-hash",
      questions: [question],
      status: "question_round",
    }));
  });

  it("fails only for an operational handoff conflict instead of overwriting an open conversation", async () => {
    await expect(harness({ id: "open" }).application.create({
      cardKey: "feature:work-any", feature, project, questions: [question],
    })).rejects.toThrow(/HANDOFF_CONFLICT/);
  });
});
