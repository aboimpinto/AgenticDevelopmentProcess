import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectReviewRemediationLifecycle } from "../src/review-remediation-lifecycle-policy.js";

const featurePath = fileURLToPath(new URL("./review-remediation-lifecycle.feature", import.meta.url));
const executorPath = fileURLToPath(new URL("../src/bootstrap/phase-worker-applications.ts", import.meta.url));
const successorApplicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-remediation-successor-application.ts", import.meta.url));
const successorPromptPath = fileURLToPath(new URL("../src/workflows/prompts/phase-remediation-successor-prompt.ts", import.meta.url));
const remediationValidatorPath = fileURLToPath(new URL("../src/review-contract-policy/remediation-validation.ts", import.meta.url));
const ingestionPath = fileURLToPath(new URL("../src/review-ingestion-service.ts", import.meta.url));

describe("generic review remediation lifecycle Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps anonymous scenarios connected to one shared executor policy", () => {
    const executor = readFileSync(executorPath, "utf8");
    const successorApplication = readFileSync(successorApplicationPath, "utf8");
    const remediationValidator = readFileSync(remediationValidatorPath, "utf8");
    const ingestion = readFileSync(ingestionPath, "utf8");

    expect(feature).toContain("Scenario: A settled observation accompanies an open blocker");
    expect(feature).toContain("Scenario: A scope expansion owns remediation lifecycle evidence");
    expect(feature).toContain("no feature, phase-number, task, or finding-name exception");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|Phase 3|future-touch|triage/i);
    expect(executor).toContain("projectLifecycle: projectReviewRemediationLifecycle");
    expect(successorApplication).toContain("this.dependencies.projectLifecycle(lineage.findings)");
    expect(readFileSync(successorPromptPath, "utf8")).toContain("renderReviewRemediationLifecyclePromptRules(");
    expect(remediationValidator).toContain("isRemediationLifecycleDisposition(manifestFinding.disposition)");
    expect(ingestion).toContain("isRemediationLifecycleDisposition(finding.disposition)");
  });

  it("executes mixed audit and remediation projections deterministically", () => {
    expect(projectReviewRemediationLifecycle([
      { findingId: "accepted-evidence", disposition: "OBSERVATION" },
      { findingId: "remaining-defect", disposition: "IN_SCOPE_BLOCKER" },
    ])).toEqual({
      requiredFindingIds: ["remaining-defect"],
      auditOnlyFindingIds: ["accepted-evidence"],
    });

    expect(projectReviewRemediationLifecycle([
      { findingId: "bounded-expansion", disposition: "SCOPE_EXPANSION" },
    ])).toEqual({
      requiredFindingIds: ["bounded-expansion"],
      auditOnlyFindingIds: [],
    });
  });
});
