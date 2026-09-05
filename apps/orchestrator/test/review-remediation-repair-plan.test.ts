import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { planConstrainedFixerResponseRepair } from "../src/review-remediation-repair-plan.js";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("constrained Fixer Response repair planning", () => {
  it("schedules a fresh repair only for contract-confirmed missing IDs", () => {
    expect(planConstrainedFixerResponseRepair({
      maximumRepairAttempts: 3,
      missingResponseIds: ["F2", "NEW-F3"],
      repairAttempts: 0,
    })).toEqual({
      kind: "repair",
      missingResponseIds: ["F2", "NEW-F3"],
      repairAttempt: 1,
    });
  });

  it("does not turn a generic worker result without confirmed missing IDs into a repair", () => {
    expect(planConstrainedFixerResponseRepair({
      maximumRepairAttempts: 3,
      missingResponseIds: [],
      repairAttempts: 1,
    })).toEqual({ kind: "complete", missingResponseIds: [], repairAttempt: 1 });
  });

  it("stops deterministically at the bounded repair cap", () => {
    expect(planConstrainedFixerResponseRepair({
      maximumRepairAttempts: 2,
      missingResponseIds: ["F2"],
      repairAttempts: 2,
    })).toEqual({ kind: "capped", missingResponseIds: ["F2"], repairAttempt: 2 });
  });

  it("keeps repair workers report-only and revalidates before review can continue", () => {
    const workflow = readFileSync(
      resolve(testDir, "../src/workflows/implementation/autonomous-implementation-workflow-application.ts"),
      "utf8",
    );
    const application = readFileSync(
      resolve(testDir, "../src/workflows/reviews/fixer-response-repair-application.ts"),
      "utf8",
    );
    const postWorkerReview = readFileSync(
      resolve(testDir, "../src/workflows/reviews/phase-post-worker-review-application.ts"),
      "utf8",
    );
    const prompt = readFileSync(resolve(testDir, "../src/workflows/prompts/fixer-response-repair-prompt.ts"), "utf8");

    expect(workflow).toContain("this.dependencies.postWorkerReview.prepare({");
    expect(postWorkerReview).toContain("this.dependencies.findLatestReportPath(input.feature, input.phase.number)");
    expect(postWorkerReview).toContain("this.dependencies.repairFixerResponse({");
    expect(application).toContain("this.dependencies.assess(this.dependencies.read(input.reportPath))");
    expect(application).toContain("this.dependencies.plan({");
    expect(application).toContain("missingResponseIds: remediation.missingResponses");
    expect(application).toContain('agentName: "Fixer Response Repair Agent"');
    expect(application).toContain("remediation = this.dependencies.assess(this.dependencies.read(input.reportPath))");
    expect(prompt).toContain("Edit only this latest review report");
    expect(prompt).toContain("Do not edit source code, tests, FeatureTasks.md, phase documents");
    expect(prompt).toContain("The reviewer-owned report content is immutable");
    expect(prompt).toContain("Do not request, perform, or claim a review rerun");
    expect(prompt).toContain("A `FIX_PROPOSED` or `ACCEPT_REFRAME` must also include `Acceptance evidence`");
    expect(prompt).toContain("`REBUTTAL_PROPOSED`, `OUTSIDE_OF_SCOPE`, and `REJECT_REFRAME`");
    expect(prompt).toContain("complete decision-specific field set");
    expect(prompt).toContain("only canonical response container is an exact top-level `## Fixer Response` heading");
  });
});
