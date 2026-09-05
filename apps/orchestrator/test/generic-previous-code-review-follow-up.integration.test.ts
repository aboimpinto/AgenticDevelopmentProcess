import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PreviousCodeReviewFollowUpPresenter } from "../src/workflows/reviews/previous-code-review-follow-up-presenter.js";

const featurePath = fileURLToPath(new URL("./generic-previous-code-review-follow-up.feature", import.meta.url));
const presenterPath = fileURLToPath(new URL(
  "../src/workflows/reviews/previous-code-review-follow-up-presenter.ts",
  import.meta.url,
));
const orchestratorPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));
const reviewCompositionPath = fileURLToPath(new URL(
  "../src/bootstrap/phase-review-applications.ts",
  import.meta.url,
));

describe("generic previous code-review follow-up Gherkin integration", () => {
  it("binds all generic scenarios to the production presenter", () => {
    const specification = readFileSync(featurePath, "utf8");
    const presenter = readFileSync(presenterPath, "utf8");
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const reviewComposition = readFileSync(reviewCompositionPath, "utf8");

    expect(specification.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/\b(?:FEAT|EPIC|Phase|Task)[- ]\d+\b/i);
    expect(presenter).toContain("this.repository.findLatest(featureFolderPath, phaseNumber)");
    expect(presenter).toContain(": this.repository.extract(previousFailureBrief ?? \"\")");
    expect(presenter).toContain("formatCodeReviewFindingForPrompt(finding)");
    expect(presenter).toContain("exactly one Reviewer Decision token");
    expect(presenter).toContain("Progress since predecessor");
    expect(presenter).toContain("Accepted this cycle");
    expect(presenter).toContain("Still outstanding");
    expect(presenter).toContain("Stable finding identity does not mean unchanged scope");
    expect(presenter).toContain("best-effort and non-authoritative");
    expect(presenter).toContain("must not be parsed, validated, used as gate evidence, or cause review/phase failure");
    expect(orchestrator).toContain("previousReviewPresenter: previousCodeReviewFollowUpPresenter");
    expect(reviewComposition).toContain("dependencies.previousReviewPresenter.render(");
    expect(orchestrator).not.toContain("function renderPreviousCodeReviewFollowUpInstructions");
    expect(typeof PreviousCodeReviewFollowUpPresenter).toBe("function");
  });
});
