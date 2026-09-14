import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROJECT_TEST_PLAN_AUTHORING_POLICY } from "../src/workflows/prompts/project-test-plan-authoring-policy.js";
import { verificationContract } from "../src/workflows/prompts/verification-contract.js";
import { buildRefineFeaturePrompt } from "../src/workflows/prompts/feature-entry-prompts.js";
import { renderPhasePlanningAcceptanceRules } from "../src/workflows/prompts/phase-planning-acceptance-prompt.js";

describe("project-owned TestPlan authoring handoff", () => {
  it("keeps the published authoring policy identical to the worker instructions", () => {
    expect(PROJECT_TEST_PLAN_AUTHORING_POLICY).toBe(readFileSync("docs/architecture/project-test-plan-authoring.md", "utf8"));
  });
  it("keeps document-authoring instructions out of read-only coverage prompts", () => {
    expect(verificationContract()).not.toContain(PROJECT_TEST_PLAN_AUTHORING_POLICY);
    expect(verificationContract()).toContain("## TestPlan");
  });
  it.each(["service", "native", "web", "mixed", "custom"])("passes one contract to refinement and development for a %s project", (stack) => {
    const project = { id: "project", name: stack, rootPath: `/workspace/${stack}`, memoryBankPath: `/workspace/${stack}/MemoryBank` } as any;
    const feature = { externalId: "ITEM-Q", title: "Export records", specMarkdown: `Use the configured ${stack} runner.` } as any;
    expect(buildRefineFeaturePrompt(project, feature)).toContain(PROJECT_TEST_PLAN_AUTHORING_POLICY);
    for (const isPlanningPhase of [true, false]) {
      expect(renderPhasePlanningAcceptanceRules({ isPlanningPhase, epicAcceptanceTestsFileName: "Acceptance.md", featurePlanningArtifactFileName: "planning-analysis-report.md" }).join("\n"))
        .toContain(PROJECT_TEST_PLAN_AUTHORING_POLICY);
    }
    expect(verificationContract(true)).toContain(PROJECT_TEST_PLAN_AUTHORING_POLICY);
  });
});
