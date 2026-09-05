import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseReviewPublicationApplication } from "../src/workflows/reviews/phase-review-publication-application.js";

const featurePath = fileURLToPath(new URL("./generic-phase-review-publication-application.feature", import.meta.url));

describe("generic phase review publication Gherkin integration", () => {
  it("specifies approval, findings, blocker, and refusal behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: An approved review is published");
    expect(specification).toContain("Scenario: A review requests changes");
    expect(specification).toContain("Scenario: A review blocks progress");
    expect(specification).toContain("Scenario: Authoritative publication refuses the artifact");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production application", () => {
    expect(typeof PhaseReviewPublicationApplication).toBe("function");
  });
});
