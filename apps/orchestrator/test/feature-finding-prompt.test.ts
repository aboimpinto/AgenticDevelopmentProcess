import type { StoredFeatureFinding } from "@hepha/db";
import type { WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import {
  buildFeatureFindingPrompt,
  renderFindingThread,
} from "../src/workflows/prompts/feature-finding-prompt.js";

const project = {
  id: "project-x",
  memoryBankPath: "/memory",
  name: "Arbitrary project",
  rootPath: "/workspace",
} as StoredProject;
const feature = { externalId: "ITEM-X", title: "Arbitrary capability" } as WorkItemCard;
const findingPhase = { fileName: "phase-x-human-review.md", path: "/memory/phase-x-human-review.md" };
const policies = {
  lessonsLearnedExecutionConstraintsRule: "LESSONS_POLICY",
  windowsShellHygieneRule: "SHELL_POLICY",
};

function finding(events: StoredFeatureFinding["events"]): StoredFeatureFinding {
  return {
    cardKey: "feature:ITEM-X",
    closedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    currentStep: null,
    error: null,
    events,
    id: "finding-x",
    projectId: "project-x",
    runId: null,
    status: "open",
    summary: null,
    title: "Unexpected behavior",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("feature finding prompt", () => {
  it("binds arbitrary identity, policy, and collected context", () => {
    const prompt = buildFeatureFindingPrompt(project, feature, "COLLECTED_CONTEXT", finding([]), findingPhase, policies);

    expect(prompt).toContain("Human Review Finding Agent");
    expect(prompt).toContain("FEAT: ITEM-X - Arbitrary capability");
    expect(prompt).toContain("Finding ID: finding-x");
    expect(prompt).toContain("Human review phase path: /memory/phase-x-human-review.md");
    expect(prompt).toContain("LESSONS_POLICY");
    expect(prompt).toContain("SHELL_POLICY");
    expect(prompt).toContain("COLLECTED_CONTEXT");
  });

  it("keeps bug repair and valid no-change outcomes available without inventing work", () => {
    const prompt = buildFeatureFindingPrompt(project, feature, "CTX", finding([]), findingPhase, policies);

    expect(prompt).toContain("fix it in the current workspace with the smallest correct change");
    expect(prompt).toContain("do not invent changes; record useful validation evidence instead");
    expect(prompt).toContain("Finding Result: FIXED");
    expect(prompt).toContain("Finding Result: NO_CHANGE_NEEDED");
    expect(prompt).toContain("Finding Result: NEEDS_MORE_INFO");
    expect(prompt).toContain("Finding Result: BLOCKED");
  });

  it("renders the complete thread chronologically with semantic speakers", () => {
    const thread = renderFindingThread(finding([
      { id: "one", content: "Initial detail", createdAt: "T1", kind: "finding", role: "user" },
      { id: "two", content: "First solution", createdAt: "T2", kind: "solution", role: "agent" },
      { id: "three", content: "More detail", createdAt: "T3", kind: "follow_up", role: "user" },
      { id: "four", content: "State transition", createdAt: "T4", kind: "status", role: "system" },
    ]));

    expect(thread).toContain("### 1. Initial user finding");
    expect(thread).toContain("### 2. Agent solution");
    expect(thread).toContain("### 3. User follow-up");
    expect(thread).toContain("### 4. System note");
    expect(thread.indexOf("Initial detail")).toBeLessThan(thread.indexOf("More detail"));
  });

  it("preserves task, verification, and human-acceptance gates", () => {
    const prompt = buildFeatureFindingPrompt(project, feature, "CTX", finding([]), findingPhase, policies);

    expect(prompt).toContain("`**Finding Tasks:**` checklist");
    expect(prompt).toContain("verification intent labels and configured verification evidence");
    expect(prompt).toContain("Keep user code review and manual testing as human gates");
    expect(prompt).toContain("Do not move the finding to AWAITING_USER_ACCEPTANCE until its finding tasks are complete");
    expect(prompt).toContain("Do not push to remotes");
  });
});
