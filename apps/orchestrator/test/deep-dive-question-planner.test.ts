import type { WorkItemCard } from "@hepha/shared";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeepDiveQuestionPrompt,
  DeepDiveQuestionPlanner,
  extractNeedsValidationTopics,
} from "../src/application/deep-dive/deep-dive-question-planner.js";
import { createDeepDivePreparationSource } from "../src/application/deep-dive/deep-dive-preparation-source.js";

function item(kind: "epic" | "feature" = "feature", specMarkdown = "# Work"): WorkItemCard {
  return {
    externalId: "WORK-ANY",
    kind,
    specMarkdown,
    title: "Generic work",
  } as WorkItemCard;
}

function project() {
  return {
    createdAt: "2031-01-01T00:00:00.000Z",
    id: "project-any",
    memoryBankPath: "/memory-bank",
    name: "Any project",
    rootPath: "/project",
    updatedAt: "2031-01-01T00:00:00.000Z",
  };
}

function generatedQuestion() {
  return {
    options: [
      { description: "First consequence", label: "First" },
      { description: "Second consequence", label: "Second" },
      { description: "Third consequence", label: "Third" },
    ],
    prompt: "Which choice applies?",
    recommendedOptionLabel: "Second",
    topic: "Boundary",
  };
}

describe("Deep-Dive question planner", () => {
  it("uses valid generated questions with bounded implementation-profile invocation", async () => {
    const runPrompt = vi.fn(async () => JSON.stringify({ questions: [generatedQuestion()] }));
    const renderLessons = vi.fn(() => "Lessons context");
    const planner = new DeepDiveQuestionPlanner({
      renderLessons,
      runPrompt,
      sessionDirectory: "/sessions",
      stallTimeoutMs: 7654,
    });

    const result = await planner.create(project(), item(), {
      plan: handoffPlan("model-any"),
      workflowRunId: "run-any",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ recommendedOptionId: "option-2-second", topic: "Boundary" });
    expect(renderLessons).toHaveBeenCalledWith(project());
    expect(runPrompt).toHaveBeenCalledWith(
      expect.stringContaining("Lessons context"),
      handoffPlan("model-any"),
      expect.objectContaining({
        cwd: "/project",
        implementationProfile: true,
        maxRuntimeMs: null,
        sessionFile: "/sessions/run-any-deep-dive-questions.json",
        stallTimeoutMs: 7654,
      }),
    );
  });

  it("rejects a static multi-question batch instead of truncating adaptive coverage", async () => {
    const planner = new DeepDiveQuestionPlanner({
      renderLessons: () => "",
      runPrompt: vi.fn(async () => JSON.stringify({
        questions: [generatedQuestion(), { ...generatedQuestion(), topic: "Second" }],
      })),
      sessionDirectory: "/sessions",
      stallTimeoutMs: 100,
    });

    await expect(planner.create(
      project(),
      item(),
      { plan: handoffPlan("model-any") },
    )).rejects.toThrow("must return exactly one question");
  });

  it("fails visibly instead of substituting generic questions after model failure", async () => {
    const warn = vi.fn();
    const planner = new DeepDiveQuestionPlanner({
      renderLessons: () => "",
      runPrompt: vi.fn(async () => { throw new Error("model unavailable"); }),
      sessionDirectory: "/sessions",
      stallTimeoutMs: 100,
      warn,
    });
    const markdown = "## **Scope**\n\n- [NEEDS VALIDATION] Choose the boundary.\n\n## Runtime\n\n[NEEDS VALIDATION] Choose the mode.";

    await expect(planner.create(
      project(),
      item("feature", markdown),
      { plan: handoffPlan("model-any") },
    )).rejects.toThrow("model unavailable");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no synthetic question round"), expect.any(Error));
  });

  it("extracts topics and renders explicit generic question policy", () => {
    const topics = extractNeedsValidationTopics("## **Delivery_Mode**\n\n* [NEEDS VALIDATION] `Choose` **one** mode.");
    expect(topics).toEqual([{ detail: "Choose one mode.", heading: "Delivery Mode" }]);
    const prompt = buildDeepDiveQuestionPrompt(item(), topics, "Project lessons");
    expect(prompt).toContain("This is Deep-Dive stage 1 only");
    expect(prompt).toContain("Project lessons");
    expect(prompt).toContain("Delivery Mode: Choose one mode.");
    expect(prompt).toContain("Return exactly one opening question");
    expect(prompt).toContain("total interview length has no arbitrary limit");
    expect(prompt).toContain("Do not defer decisions to refinement, implementation, human sign-off");
    expect(prompt).not.toContain("create 3 questions");
  });

  it("discovers questions across the Feature Description and authoritative design documents", () => {
    const preparationSource = createDeepDivePreparationSource([
      {
        fileName: "FeatureDescription.md",
        label: "Feature description",
        markdown: "# Capability\n\nStable scope.",
        path: "/memory/FeatureDescription.md",
        updatedAt: "2031-01-01T00:00:00.000Z",
      },
      {
        fileName: "UX-research-report.md",
        label: "UX research report",
        markdown: "## Navigation\n\n[NEEDS VALIDATION] Choose the placement.",
        path: "/memory/UX-research-report.md",
        updatedAt: "2031-01-02T00:00:00.000Z",
      },
    ]);

    const topics = extractNeedsValidationTopics(preparationSource.promptMarkdown);
    const prompt = buildDeepDiveQuestionPrompt(item(), topics, "Project lessons", preparationSource);

    expect(topics).toContainEqual({ detail: "Choose the placement.", heading: "Navigation" });
    expect(prompt).toContain("Authoritative preparation documents:");
    expect(prompt).toContain("UX-research-report.md");
    expect(prompt).toContain("Choose the placement.");
  });
});
