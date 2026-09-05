import type { StoredDeepDiveSession } from "@hepha/db";
import { handoffPlan } from "./support/handoff-plan-fixture.js";
import type { DeepDiveQuestion } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import {
  buildDeepDiveDocumentUpdatePrompt,
  cleanResolvedValidationMarkerText,
  createDeterministicDeepDiveDocumentUpdate,
  DeepDiveDocumentUpdater,
  stripMarkdownFence,
  upsertMarkdownSection,
} from "../src/application/deep-dive/deep-dive-document-updater.js";

function session(originalDocument = "# Generic work\n\n[NEEDS VALIDATION] Decide scope."): StoredDeepDiveSession {
  return {
    agentConnectionStatus: "active",
    cardExternalId: "WORK-ANY",
    cardId: "card-any",
    cardKey: "feature:WORK-ANY",
    cardKind: "feature",
    cardTitle: "Generic work",
    completedAt: null,
    createdAt: "2031-01-01T00:00:00.000Z",
    id: "session-any",
    originalDocument,
    originalDocumentHash: "hash-any",
    originalDocumentPath: "/work.md",
    originalDocumentUpdatedAt: "2031-01-01T00:00:00.000Z",
    projectId: "project-any",
    questions: [],
    status: "ready_for_update",
    updatedAt: "2031-01-01T00:00:00.000Z",
  };
}

function question(): DeepDiveQuestion {
  return {
    answerText: "Use the bounded variant.",
    chatMessages: [{
      content: "Keep [NEEDS VALIDATION] out of the resolved answer.",
      createdAt: "2031-01-01T00:00:00.000Z",
      id: "message-any",
      role: "user",
    }],
    id: "question-any",
    options: [{ description: "Apply a bounded rule.", id: "bounded", label: "Bounded" }],
    prompt: "Which boundary applies?",
    recommendedOptionId: "bounded",
    selectedOptionId: "bounded",
    status: "answered",
    topic: "Scope [NEEDS VALIDATION]",
  };
}

describe("deep-dive document updater", () => {
  it("runs the model with the implementation profile and normalizes its Markdown", async () => {
    const runPrompt = vi.fn(async () => "```markdown\n# Updated\n\nNo [NEEDS VALIDATION] markers remain.\n```");
    const updater = new DeepDiveDocumentUpdater({
      maxModelRewriteCharacters: 10_000,
      runPrompt,
      sessionDirectory: "/sessions",
      timeoutMs: 4321,
    });

    await expect(updater.update(session(), [question()], {
      cwd: "/project",
      plan: handoffPlan("model-any"),
      workflowRunId: "run-any",
    })).resolves.toBe("# Updated\n\nNo validation markers remain.");
    expect(runPrompt).toHaveBeenCalledWith(
      expect.stringContaining("This is Deep-Dive stage 2 only"),
      handoffPlan("model-any"),
      expect.objectContaining({
        cwd: "/project",
        implementationProfile: true,
        sessionFile: "/sessions/run-any-deep-dive-document-update.json",
        timeoutMs: 4321,
        workflowRunId: "run-any",
      }),
    );
  });

  it("uses a deterministic update for oversized documents without calling the model", async () => {
    const runPrompt = vi.fn();
    const updater = new DeepDiveDocumentUpdater({
      maxModelRewriteCharacters: 5,
      now: () => new Date("2031-02-03T04:05:06.000Z"),
      runPrompt,
      sessionDirectory: "/sessions",
      timeoutMs: 100,
    });

    const result = await updater.update(session("# Work\n\n[NEEDS VALIDATION] scope"), [question()], {
      plan: handoffPlan("model-any"),
    });
    expect(runPrompt).not.toHaveBeenCalled();
    expect(result).toContain("## Hepha Deep-Dive Decisions");
    expect(result).toContain("Recorded: 2031-02-03T04:05:06.000Z");
    expect(result).toContain("Decision: **Bounded** - Apply a bounded rule.");
    expect(result).toContain("Additional detail: Use the bounded variant.");
    expect(result).not.toContain("[NEEDS VALIDATION]");
  });

  it("falls back after model failure and replaces an existing decision section", async () => {
    const warn = vi.fn();
    const updater = new DeepDiveDocumentUpdater({
      maxModelRewriteCharacters: 10_000,
      now: () => new Date("2031-02-03T04:05:06.000Z"),
      runPrompt: vi.fn(async () => { throw new Error("model unavailable"); }),
      sessionDirectory: "/sessions",
      timeoutMs: 100,
      warn,
    });
    const original = "# Work\n\n## Hepha Deep-Dive Decisions\n\nOld decision\n\n## Keep Me\n\nContent";
    const result = await updater.update(session(original), [question()], { plan: handoffPlan("model-any") });

    expect(result).not.toContain("Old decision");
    expect(result).toContain("Fallback reason: model unavailable");
    expect(result).toContain("## Keep Me\n\nContent");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("falling back"), expect.any(Error));
  });

  it("renders prompts and Markdown helpers without workflow-specific identities", () => {
    const prompt = buildDeepDiveDocumentUpdatePrompt(session(), [question()]);
    expect(prompt).toContain("Deep-dive transcript:");
    expect(prompt).toContain("must not require future human sign-off");
    expect(prompt).toContain("autonomous developer can execute deterministically");
    expect(stripMarkdownFence("```\nbody\n```")).toBe("body");
    expect(cleanResolvedValidationMarkerText("Without [NEEDS VALIDATION] markers.")).toBe("Without validation markers.");
    expect(upsertMarkdownSection("# Work", "Decision", "## Decision\n\nNew")).toBe("# Work\n\n## Decision\n\nNew");
    expect(createDeterministicDeepDiveDocumentUpdate(
      session("# Work"),
      [question()],
      "fallback",
      () => new Date("2031-02-03T04:05:06.000Z"),
    )).toContain("Fallback reason: fallback");
  });
});
