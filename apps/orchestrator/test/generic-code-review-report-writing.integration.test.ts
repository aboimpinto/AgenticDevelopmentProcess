import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-code-review-report-writing.feature"), "utf8");
const orchestratorSource = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const reviewCompositionSource = readFileSync(resolve(testRoot, "../src/bootstrap/phase-review-applications.ts"), "utf8");
const infrastructureSource = readFileSync(resolve(testRoot, "../src/bootstrap/workflow-infrastructure-applications.ts"), "utf8");

describe("generic code-review report writing Gherkin integration", () => {
  it("defines three identity-blind persistence outcomes", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/(?:FEAT|EPIC|Phase|Task)-?\d+/i);
  });

  it("uses the extracted writer and excludes obsolete test-only review logic", () => {
    expect(infrastructureSource).toContain("new CodeReviewReportWriter");
    expect(orchestratorSource).toContain("reportWriter: codeReviewReportWriter");
    expect(reviewCompositionSource).toContain("dependencies.reportWriter.write");
    expect(orchestratorSource).not.toContain("function writeCodeReviewReport");
    expect(orchestratorSource).not.toContain("function parseReviewResult");
    expect(orchestratorSource).not.toContain("function renderReviewContractManifestReport");
  });
});
