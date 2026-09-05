import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(fileURLToPath(new URL("./generic-human-review-phase-composition.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const composition = readFileSync(fileURLToPath(new URL("../src/bootstrap/human-review-phase-application.ts", import.meta.url)), "utf8");

describe("generic human-review phase composition Gherkin integration", () => {
  it("specifies identity-blind execution and user-waiting paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(feature).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds the human-review phase constructor to one root factory call", () => {
    expect(root).toContain("createHumanReviewPhaseApplication({");
    expect(root).not.toContain("new HumanReviewFindingsPhaseApplication");
    expect(composition).toContain("new HumanReviewFindingsPhaseApplication");
    expect(composition).toContain("dependencies.completionEvidence.summarizeHumanReview");
  });
});
