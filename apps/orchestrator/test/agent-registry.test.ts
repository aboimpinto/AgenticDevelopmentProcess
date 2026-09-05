import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../src/agent-routing/agent-registry.js";

describe("AgentRegistry", () => {
  it("exposes every canonical worker-producing action through one versioned registry", () => {
    const registry = new AgentRegistry();
    const expected = [
      ["submit-epic", "Discovery & Planning", 1, "Submit EPIC", 1],
      ["refine-epic", "Discovery & Planning", 1, "Refine EPIC", 2],
      ["submit-feature", "Discovery & Planning", 1, "Submit Feature", 3],
      ["deep-dive", "Discovery & Planning", 1, "Deep-Dive", 4],
      ["design-feature", "Discovery & Planning", 1, "Design Feature", 5],
      ["refine-feature", "Discovery & Planning", 1, "Refine Feature", 6],
      ["ui-requirement-evaluation", "Discovery & Planning", 1, "UI Requirement Evaluation", 7],
      ["start-feature", "Implementation", 2, "Start Feature", 1],
      ["continue-implementing", "Implementation", 2, "Continue Implementing", 2],
      ["phase-worker", "Implementation", 2, "Phase Worker", 3],
      ["resolve-review-findings", "Implementation", 2, "Resolve Review Findings", 4],
      ["workflow-recovery", "Implementation", 2, "Workflow Recovery", 5],
      ["code-review", "Review", 3, "Code Review", 1],
      ["complete-feature", "Completion", 4, "Complete Feature", 1],
      ["phase-lessons-capture", "Knowledge & Documentation", 5, "Phase Lessons Capture", 1],
      ["feature-lessons-writer", "Knowledge & Documentation", 5, "Feature Lessons Writer", 2],
      ["post-complete-lessons-curator", "Knowledge & Documentation", 5, "Post-Complete LessonsLearned Curator", 3],
    ] as const;

    expect(registry.version).toBe("agent-registry/v1");
    expect(registry.list().map((entry) => [entry.actionId, entry.actionTypeLabel, entry.actionTypeDisplayOrder, entry.label, entry.displayOrder])).toEqual(expected);
    expect(registry.list()).toEqual(registry.list());
    expect(new Set(registry.list().map((entry) => entry.actionId))).toHaveProperty("size", 17);
    expect(new Set(registry.list().map((entry) => entry.actionType))).toHaveProperty("size", 5);
    expect(registry.get("code-review")?.capabilityRequirements).toMatchObject({ minimumContextWindowTokens: 64_000, requiresTools: true });
    expect(registry.get("post-complete-lessons-curator")?.actionType).toBe("knowledge_documentation");
  });

  it("rejects malformed, empty, unversioned, duplicate-action, and duplicate role/prompt contracts", () => {
    const registry = new AgentRegistry();
    const entry = registry.get("code-review");
    const completion = registry.get("complete-feature");
    if (!entry || !completion) throw new Error("Missing test fixture.");
    expect(() => new AgentRegistry([], "agent-registry/v1")).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry], "agent-registry/latest")).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([{ ...entry, actionId: "bad id" }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([{ ...entry, label: "" }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([{ ...entry, displayOrder: 0 }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([{ ...entry, unexpected: true }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry, entry])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry, { ...entry, actionId: "another-action" }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry, { ...entry, actionId: "another-action", promptVersion: "another-action/v1", displayOrder: entry.displayOrder }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry, { ...entry, actionId: "another-action", promptVersion: "another-action/v1", displayOrder: 2, actionTypeLabel: "Reviews" }])).toThrow("Agent registry is invalid.");
    expect(() => new AgentRegistry([entry, { ...completion, actionTypeDisplayOrder: entry.actionTypeDisplayOrder }])).toThrow("Agent registry is invalid.");
  });

  it("places one valid fixture action exactly once in its declared group order", () => {
    const canonical = new AgentRegistry().list();
    const review = canonical.find((entry) => entry.actionId === "code-review");
    if (!review) throw new Error("Missing test fixture.");
    const securityReview = {
      ...review,
      actionId: "security-review",
      label: "Security Review",
      displayOrder: 2,
      promptVersion: "security-review/v1",
    };
    const entries = [...canonical].reverse();
    entries.push(securityReview);

    const registry = new AgentRegistry(entries);
    const reviewActions = registry.list().filter((entry) => entry.actionType === "review");
    expect(reviewActions.map((entry) => [entry.actionId, entry.label, entry.displayOrder])).toEqual([
      ["code-review", "Code Review", 1],
      ["security-review", "Security Review", 2],
    ]);
    expect(registry.list().filter((entry) => entry.actionId === "security-review")).toHaveLength(1);
  });
});
