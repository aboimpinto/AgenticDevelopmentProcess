import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CodeReviewFailureContextRepository } from "../src/workflows/reviews/code-review-failure-context-repository.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-code-review-failure-context.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const reviewCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-review-applications.ts", import.meta.url)),
  "utf8",
);
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic code-review failure context Gherkin integration", () => {
  it("specifies actionable selection and supersession without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds review recovery and failure presentation to the extracted repository", () => {
    const repository = new CodeReviewFailureContextRepository();

    expect(repository.extract("no report persisted")).toBeNull();
    expect(infrastructureSource).toContain("new CodeReviewFailureContextRepository");
    expect(orchestratorSource).toContain("failureContexts: codeReviewFailureContextRepository");
    expect(reviewCompositionSource).toContain("dependencies.failureContexts.resolve");
    expect(orchestratorSource).not.toContain("function findLatestCodeReviewReport");
    expect(orchestratorSource).not.toContain("function hasNewerApprovedCodeReviewReport");
  });
});
