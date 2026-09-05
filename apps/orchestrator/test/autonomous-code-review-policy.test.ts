import { describe, expect, it } from "vitest";
import { isProductionSourcePath, requiresAutonomousCodeReview, selectProductionCodeReviewFiles } from "../src/autonomous-code-review-policy.js";

describe("autonomous code-review policy", () => {
  it("requires review when any production source file changed", () => {
    expect(requiresAutonomousCodeReview({
      changedFiles: ["MemoryBank/Features/FEAT-001/planning-analysis-report.md", "apps/orchestrator/src/index.ts"],
    })).toBe(true);
  });

  it("does not require review for planning, documentation, or test-only changes", () => {
    expect(requiresAutonomousCodeReview({
      changedFiles: [
        "MemoryBank/Features/FEAT-001/planning-analysis-report.md",
        "MemoryBank/Features/FEAT-001/Phases/phase-1-planning-analysis.md",
        "apps/orchestrator/test/review-policy.test.ts",
        "apps/web/e2e/workflow.spec.ts",
        "TestProjects/Orchestrator.ContractTests/catalog-fixture.ts",
        "src/Contract.Tests/review-helper.ts",
      ],
    })).toBe(false);
  });

  it("classifies production paths independently of phase number, title, or a waiver", () => {
    expect(isProductionSourcePath("src/domain/rule.ts")).toBe(true);
    expect(isProductionSourcePath("apps/orchestrator/src/authoritative-review-integration.ts")).toBe(true);
    expect(isProductionSourcePath("apps/orchestrator/test/rule.test.ts")).toBe(false);
    expect(isProductionSourcePath("apps/orchestrator/integration/review-route.ts")).toBe(false);
    expect(isProductionSourcePath("TestProjects/Rules/rule.ts")).toBe(false);
    expect(isProductionSourcePath("src/Rules.Tests/rule.ts")).toBe(false);
    expect(isProductionSourcePath("docs/rule.ts")).toBe(false);
  });

  it("selects only production files as code-review targets", () => {
    expect(selectProductionCodeReviewFiles([
      "MemoryBank/Features/FEAT-064/Phases/phase-1.md",
      "apps/orchestrator/test/review-contract-rule-catalog.test.ts",
      "TestProjects/Orchestrator.ContractTests/catalog-fixture.ts",
      "apps/orchestrator/src/review-contract-catalog.ts",
      "docs/architecture/rule.ts",
      "apps/orchestrator/src/review-contract-catalog.ts",
    ])).toEqual(["apps/orchestrator/src/review-contract-catalog.ts"]);
  });
});
