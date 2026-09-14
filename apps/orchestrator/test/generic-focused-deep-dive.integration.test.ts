import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { WorkItemCard } from "@hepha/shared";
import { SqliteCardRepository } from "../../../packages/db/src/sqlite/repositories/sqlite-card-repository.js";
import { SqliteMetadataSchema } from "../../../packages/db/src/sqlite/sqlite-metadata-schema.js";
import { SqliteQueryContext } from "../../../packages/db/src/sqlite/sqlite-query-context.js";
import { DeepDiveStartApplication } from "../src/application/deep-dive/deep-dive-start-application.js";
import { DeepDiveQuestionPlanner } from "../src/application/deep-dive/deep-dive-question-planner.js";
import { buildDeepDiveFollowUpPrompt } from "../src/application/deep-dive/deep-dive-follow-up-planner.js";
import { buildDeepDiveDocumentUpdatePrompt } from "../src/application/deep-dive/deep-dive-document-updater.js";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import type { StoredProject } from "../src/projects/stored-project.js";
import { FeaturePreparationApplication } from "../src/application/features/feature-preparation-application.js";
import { DevCycleMcpCompatibilityApplication } from "../src/workflows/recipes/devcycle-mcp-compatibility-application.js";

describe("voluntary focused Deep-Dive through application, SQLite and prompt builders", () => {
  it.each(["unknown", "requires_ui"] as const)("rejects %s refinement through both production entry points before worker or metadata writes", async (decision) => {
    const worker = vi.fn();
    const record = vi.fn();
    const target = { project: { id: "sample" }, feature: { stateFolder: "01_SUBMITTED", featureWorkflow: { uiRequirementDecision: decision, hasDesignArtifacts: false } } };
    const native = new FeaturePreparationApplication({ resolveWorkflow: async () => target, startRefineWorker: worker, metadataStore: { recordFeatureWorkflowRun: record } } as never);
    const compatibility = new DevCycleMcpCompatibilityApplication({ resolveTarget: async () => target, runWorker: worker, metadata: { start: record } } as never);
    await expect(native.startRefine({ projectId: "sample", cardId: "sample" })).rejects.toThrow(/UI requirements/);
    await expect(compatibility.start("refineFeature", { projectId: "sample", cardId: "sample" })).rejects.toThrow(/UI requirements/);
    expect(worker).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it("reopens a clarified feature and retains focus across opening, follow-up and completion without changing source", async () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteCardRepository(new SqliteQueryContext(database, new SqliteMetadataSchema(database)));
    const source = "# Sample capability\n\nExisting agreed scope.";
    const item = { id: "sample", externalId: "SAMPLE", kind: "feature", title: "Sample", stateFolder: "01_SUBMITTED", epicState: null, documentPath: "/sample/FeatureDescription.md", documentUpdatedAt: null, specMarkdown: source } as WorkItemCard;
    const project = { id: "sample-project", rootPath: "/sample" } as StoredProject;
    const runPrompt = vi.fn(async (_prompt: string) => JSON.stringify({ questions: [{ topic: "Accessibility", prompt: "Which keyboard behavior should be preserved?", recommendedOptionLabel: "Preserve", options: [
      { label: "Preserve", description: "Keep the current behavior" }, { label: "Extend", description: "Add shortcuts" }, { label: "Review", description: "Review the existing pattern" },
    ] }] }));
    const planner = new DeepDiveQuestionPlanner({ renderLessons: () => "", runPrompt, sessionDirectory: "/unused", stallTimeoutMs: 1000 });
    let sequence = 0;
    const application = new DeepDiveStartApplication({
      clock: () => new Date().toISOString(), createCardKey: () => "feature:SAMPLE", createId: () => String(++sequence),
      createRunner: () => ({ runNode: async (_id, _options, operation) => operation({} as never, {} as never) }),
      findProject: () => project, hashText: () => "unchanged-source-hash", notifyChanged: () => undefined,
      planQuestions: (p, card, options) => planner.create(p, card, options), requireModel: () => handoffPlan("sample-model"), scanProject: async () => [item],
      store: { enabled: true, createDeepDiveSession: s => repository.createDeepDiveSession(s), findOpenDeepDiveSession: (p, c) => repository.findOpenDeepDiveSession(p, c), getDeepDiveSession: id => repository.getDeepDiveSession(id), updateDeepDiveSession: s => repository.updateDeepDiveSession(s), recordFeatureWorkflowRun: async () => undefined },
    });
    try {
      const first = await application.start({ cardId: item.id, projectId: project.id });
      await vi.waitFor(async () => expect((await repository.getDeepDiveSession(first.id))?.status).toBe("question_round"));
      await repository.updateDeepDiveSession({ ...(await repository.getDeepDiveSession(first.id))!, status: "completed" });
      const focus = "Explore accessibility and responsive layouts in depth";
      const next = await application.start({ cardId: item.id, projectId: project.id, focus });
      expect(next.id).not.toBe(first.id);
      await vi.waitFor(async () => expect((await repository.getDeepDiveSession(next.id))?.status).toBe("question_round"));
      const stored = (await repository.getDeepDiveSession(next.id))!;
      expect(stored).toMatchObject({ focus, originalDocument: source, originalDocumentHash: "unchanged-source-hash" });
      expect(runPrompt.mock.calls.at(-1)?.[0]).toContain(focus);
      const resumed = await application.start({ cardId: item.id, projectId: project.id });
      expect(resumed.focus).toBe(focus);
      const question = resumed.questions[0]!;
      expect(buildDeepDiveFollowUpPrompt(stored, question)).toContain(focus);
      expect(buildDeepDiveDocumentUpdatePrompt(stored, [question])).toContain("not an approved decision");
      await expect(application.start({ cardId: item.id, projectId: project.id, focus: "Different topic" })).rejects.toThrow("already open");
      expect((await repository.getDeepDiveSession(next.id))?.focus).toBe(focus);
    } finally { database.close(); }
  });
});
