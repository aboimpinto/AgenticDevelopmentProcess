import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { buildHumanReviewFindingsPhasePrompt } from "../src/workflows/prompts/human-review-findings-phase-prompt.js";

const project = { id: "p", name: "Arbitrary", rootPath: "/root", memoryBankPath: "/memory" } as StoredProject;
const feature = { externalId: "ITEM-X", title: "Capability" } as WorkItemCard;
const phase = {
  documentPath: "/memory/Phases/phase-x.md",
  fileName: "phase-x.md",
  number: 23,
  title: "Review observations",
} as PhaseSummary & { number: number };
const policies = {
  lessonsLearnedExecutionConstraintsRule: "LESSONS_POLICY",
  windowsShellHygieneRule: "SHELL_POLICY",
};

function compose(phaseMarkdown = "# CURRENT PHASE") {
  return buildHumanReviewFindingsPhasePrompt(project, feature, "COLLECTED_CONTEXT", {
    branchName: "feature/arbitrary",
    phase,
    phaseMarkdown,
  }, policies);
}

describe("human-review findings phase prompt", () => {
  it("binds runtime identity, current document, policies, and context", () => {
    const prompt = compose("# DURABLE FINDINGS");
    expect(prompt).toContain("Human Review Findings Agent");
    expect(prompt).toContain("Branch: feature/arbitrary");
    expect(prompt).toContain("FEAT: ITEM-X - Capability");
    expect(prompt).toContain("Human review phase path: /memory/Phases/phase-x.md");
    expect(prompt).toContain("# DURABLE FINDINGS");
    expect(prompt).toContain("LESSONS_POLICY");
    expect(prompt).toContain("SHELL_POLICY");
    expect(prompt).toContain("COLLECTED_CONTEXT");
  });

  it("keeps all findings in one phase and preserves task and evidence structure", () => {
    const prompt = compose();
    expect(prompt).toContain("Do not create another Human Review Findings phase");
    expect(prompt).toContain("Every open finding must have a `**Finding Tasks:**` checklist");
    expect(prompt).toContain("Preserve the Checkpoints section");
    expect(prompt).toContain("Preserve the Verification Intent, Required Evidence, and Completion Gate sections");
  });

  it("reserves solved and completed decisions for durable user evidence", () => {
    const prompt = compose();
    expect(prompt).toContain("Do not mark findings solved; only the user can mark them solved");
    expect(prompt).toContain("Do not mark this phase COMPLETED unless every finding is already explicitly solved by the user");
    expect(prompt).toContain("Human Review Findings Result: READY_FOR_USER");
    expect(prompt).toContain("Human Review Findings Result: COMPLETED");
    expect(prompt).toContain("Human Review Findings Result: NEEDS_MORE_INFO");
    expect(prompt).toContain("Human Review Findings Result: BLOCKED");
  });

  it("allows an empty current document without fabricating content", () => {
    const prompt = compose("");
    expect(prompt).toContain("## Current Human Review Findings Phase\n```markdown\n\n```");
    expect(prompt).toContain("Do not push to remotes");
  });
});
