import type { PhaseSummary, WorkItemCard } from "@hepha/shared";
import { describe, expect, it } from "vitest";
import type { StoredProject } from "../src/projects/stored-project.js";
import { buildPhaseCodeReviewPrompt } from "../src/workflows/prompts/phase-code-review-prompt.js";

const project = { id: "P", name: "Project", rootPath: "/p", memoryBankPath: "/m" } as StoredProject;
const feature = { externalId: "ITEM-X", title: "Capability" } as WorkItemCard;
const phase = { number: 17, title: "Arbitrary review" } as PhaseSummary & { number: number };
const policies = {
  cargoTimeoutSafetyRule: "TIMEOUT",
  cargoValidationLadderRule: "LADDER",
  serializedBuildCommandsSkillRule: "SERIAL",
  sharedCodeQualityAssumptionsRule: "QUALITY",
  validationEvidenceAccountingRule: "ACCOUNTING",
};

describe("phase code-review prompt composition", () => {
  it("binds arbitrary review identity and context", () => {
    const prompt = buildPhaseCodeReviewPrompt(project, feature, "CONTEXT", {
      authoritativeArtifactId: "ARTIFACT",
      branchName: "feature/arbitrary",
      canonicalFeatureId: "capability",
      phase,
      previousReviewFollowUp: "FOLLOW UP",
    }, policies);
    expect(prompt).toContain("independent Code Review Agent");
    expect(prompt).toContain("Phase 17 - Arbitrary review");
    expect(prompt).toContain("Branch: feature/arbitrary");
    expect(prompt).toContain('artifactId: "ARTIFACT"');
    expect(prompt).toContain("FOLLOW UP");
    expect(prompt).toContain("CONTEXT");
  });

  it("composes scope, tooling, findings, adjudication, result, and manifest in order", () => {
    const prompt = buildPhaseCodeReviewPrompt(project, feature, "CTX", {
      authoritativeArtifactId: "A", branchName: "b", canonicalFeatureId: "c", phase,
      previousReviewFollowUp: "F",
    }, policies);
    for (const rule of Object.values(policies)) expect(prompt).toContain(rule);
    expect(prompt.indexOf("Production Code Review Target")).toBeLessThan(prompt.indexOf("QUALITY"));
    expect(prompt.indexOf("QUALITY")).toBeLessThan(prompt.indexOf("complete contract for the fixer"));
    expect(prompt.indexOf("complete contract for the fixer")).toBeLessThan(prompt.indexOf("Reviewer Decision"));
    expect(prompt.indexOf("Reviewer Decision")).toBeLessThan(prompt.indexOf("Return exactly one raw JSON"));
  });

  it("adds bounded remediation planning only when requested", () => {
    const prompt = buildPhaseCodeReviewPrompt(project, feature, "CTX", {
      authoritativeArtifactId: "A", branchName: "b", canonicalFeatureId: "c", phase,
      previousReviewFollowUp: "F", reviewerRemediationPlan: true,
    }, policies);
    expect(prompt).toContain("Reviewer Remediation Plan run, not a normal rerun");
    expect(prompt).toContain("Retain the existing finding ID");
  });
});
