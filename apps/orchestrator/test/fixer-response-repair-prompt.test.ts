import { describe, expect, it } from "vitest";
import { buildFixerResponseRepairPrompt } from "../src/workflows/prompts/fixer-response-repair-prompt.js";

describe("fixer response repair prompt", () => {
  const prompt = buildFixerResponseRepairPrompt(
    { name: "Project", rootPath: "/project" } as any,
    { externalId: "ITEM", title: "Work" } as any,
    { missingResponseIds: ["F2", "F4"], reportPath: "/reports/latest.md" },
  );

  it("limits changes to the named report and missing IDs", () => {
    expect(prompt).toContain("Edit only this latest review report: /reports/latest.md");
    expect(prompt).toContain("Required missing Fixer Response IDs: F2, F4");
    expect(prompt).toContain("Do not edit source code, tests, FeatureTasks.md, phase documents");
  });

  it("preserves reviewer-owned findings and complete responses", () => {
    expect(prompt).toContain("reviewer-owned report content is immutable");
    expect(prompt).toContain("Preserve all existing complete canonical entries exactly");
  });

  it("requires canonical decisions and decision-specific evidence", () => {
    expect(prompt).toContain("FIX_PROPOSED");
    expect(prompt).toContain("REBUTTAL_PROPOSED");
    expect(prompt).toContain("Acceptance evidence");
    expect(prompt).toContain("Argument/Contract basis/Scope basis");
  });

  it("forbids ordinary implementation and review reruns", () => {
    expect(prompt).toContain("Do not request, perform, or claim a review rerun");
    expect(prompt).toContain("Do not resume ordinary phase work");
  });
});
