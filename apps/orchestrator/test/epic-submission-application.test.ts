import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SubmitEpicInput, WorkItemCard } from "@hepha/shared";
import { describe, expect, it, vi } from "vitest";
import { EpicSubmissionApplication } from "../src/application/epics/epic-submission-application.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const finalizedOutput = JSON.stringify({
  description: "Deliver a durable project outcome.",
  outOfScope: ["Unrelated work"],
  priority: "High",
  problemStatement: "The outcome is not available today.",
  risks: [{ impact: "Medium", likelihood: "Low", mitigation: "Validate early.", risk: "Scope uncertainty" }],
  successCriteria: ["The outcome is measurable", "The result is durable"],
  suggestedFeatures: [{ dependencies: "None", priority: "P1", scope: "Deliver the core outcome.", title: "Core Outcome", userStory: "As a user, I want the outcome so that work improves." }],
  title: "Durable Project Outcome",
});

function harness(options: { collision?: boolean; promptOutputs?: string[] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "hepha-submit-epic-"));
  const project = { createdAt: "before", id: "project", memoryBankPath: root, name: "Project", rootPath: root, updatedAt: "before" } as StoredProject;
  const created = { externalId: "INITIATIVE-ANY", kind: "epic", summary: "Outcome", title: "Durable Project Outcome" } as WorkItemCard;
  const promptOutputs = [...(options.promptOutputs ?? [finalizedOutput])];
  let scans = 0;
  const dependencies = {
    chooseModel: vi.fn(() => "authoring-model"),
    currentDate: vi.fn(() => "2026-07-21"),
    findProject: vi.fn(() => project),
    idAllocator: { nextEpic: vi.fn(() => "INITIATIVE-ANY") },
    notifyChanged: vi.fn(),
    runPrompt: vi.fn(async () => promptOutputs.shift() ?? finalizedOutput),
    scanProject: vi.fn(async () => {
      scans += 1;
      return scans === 1 ? [] : [created];
    }),
  };
  if (options.collision) mkdirSync(join(root, "Features", "00_EPICS", "INITIATIVE-ANY-durable-project-outcome"), { recursive: true });
  return { application: new EpicSubmissionApplication(dependencies), dependencies, root };
}

const structuredInput: SubmitEpicInput = {
  description: "Deliver a durable outcome.",
  projectId: "project",
  successCriteria: "Outcome delivered",
  title: "Durable Project Outcome",
};

describe("EPIC submission application", () => {
  it("finalizes, creates, reloads, and announces a structured submission", async () => {
    const current = harness();
    const result = await current.application.submit(structuredInput);

    expect(result.epic.externalId).toBe("INITIATIVE-ANY");
    expect(existsSync(result.filesCreated[0]!)).toBe(true);
    expect(readFileSync(result.filesCreated[0]!, "utf8")).toContain("Durable Project Outcome");
    expect(current.dependencies.runPrompt).toHaveBeenCalledWith(
      expect.stringContaining("Draft EPIC input"),
      "authoring-model",
      expect.objectContaining({ timeoutLabel: "Submit EPIC finalizer Pi run" }),
    );
    expect(current.dependencies.notifyChanged).toHaveBeenCalledWith("project", "epic.submitted", "INITIATIVE-ANY");
  });

  it("expands a raw idea before applying the canonical finalizer", async () => {
    const ideaOutput = JSON.stringify({
      description: "Turn a rough idea into a durable outcome.",
      priority: "High",
      successCriteria: ["Outcome delivered"],
      title: "Durable Project Outcome",
    });
    const current = harness({ promptOutputs: [ideaOutput, finalizedOutput] });

    await current.application.resolveInput(
      { createdAt: "before", id: "project", memoryBankPath: current.root, name: "Project", rootPath: current.root, updatedAt: "before" } as StoredProject,
      { ideaText: "We need a durable project outcome.", mode: "idea", projectId: "project" },
    );

    expect(current.dependencies.runPrompt).toHaveBeenCalledTimes(2);
    expect(current.dependencies.runPrompt.mock.calls[0]?.[2]).toMatchObject({ timeoutLabel: "Submit EPIC idea Pi run" });
    expect(current.dependencies.runPrompt.mock.calls[1]?.[2]).toMatchObject({ timeoutLabel: "Submit EPIC finalizer Pi run" });
  });

  it("rejects an empty idea before starting an authoring prompt", async () => {
    const current = harness();
    const project = { createdAt: "before", id: "project", memoryBankPath: current.root, name: "Project", rootPath: current.root, updatedAt: "before" } as StoredProject;
    await expect(current.application.resolveIdeaDraft(project, { ideaText: "  ", mode: "idea", projectId: "project" }, []))
      .rejects.toThrow("EPIC idea text is required");
    expect(current.dependencies.runPrompt).not.toHaveBeenCalled();
  });

  it("does not overwrite an allocated identity that already exists", async () => {
    const current = harness({ collision: true });
    await expect(current.application.submit(structuredInput)).rejects.toThrow("INITIATIVE-ANY already exists");
    expect(current.dependencies.notifyChanged).not.toHaveBeenCalled();
  });
});
