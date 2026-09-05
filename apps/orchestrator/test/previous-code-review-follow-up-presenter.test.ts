import { describe, expect, it } from "vitest";
import type { CodeReviewFailureContextRepository } from "../src/workflows/reviews/code-review-failure-context-repository.js";
import { PreviousCodeReviewFollowUpPresenter } from "../src/workflows/reviews/previous-code-review-follow-up-presenter.js";

type Repository = Pick<CodeReviewFailureContextRepository, "extract" | "findLatest">;

function createRepository(overrides: Partial<Repository> = {}): Repository {
  return {
    extract: () => null,
    findLatest: () => null,
    ...overrides,
  };
}

describe("previous code-review follow-up presentation", () => {
  it("renders an explicit empty follow-up when no durable context exists", () => {
    const presenter = new PreviousCodeReviewFollowUpPresenter(createRepository());

    expect(presenter.render("/workspace/item", 4, null)).toBe([
      "Previous code-review blocker: None detected in the workflow context.",
      "Still include `Previous Review Follow-up: None` in the report.",
    ].join("\n"));
  });

  it("uses the newest persisted same-phase report before a failure brief", () => {
    let extractedBrief: string | null = null;
    const presenter = new PreviousCodeReviewFollowUpPresenter(createRepository({
      extract: (brief) => {
        extractedBrief = brief;
        return null;
      },
      findLatest: () => ({
        markdown: [
          "Review Result: NEEDS_CHANGES",
          "",
          "## Findings",
          "",
          "### F7 — Persisted contract gap",
          "- **Severity**: REQUIRED",
          "- **File / Line**: src/policy.ts:18",
          "- **Finding**: Persisted evidence is incomplete",
          "- **Required Change**: Verify both outcome branches",
        ].join("\n"),
        path: "/workspace/item/code-reviews/phase-4-code-review-latest.md",
        result: "NEEDS_CHANGES",
      }),
    }));

    const output = presenter.render("/workspace/item", 4, "older failure brief");

    expect(extractedBrief).toBeNull();
    expect(output).toContain("Previous review report: /workspace/item/code-reviews/phase-4-code-review-latest.md");
    expect(output).toContain("Previous review result: NEEDS_CHANGES");
    expect(output).toContain("F7 [REQUIRED] Location: src/policy.ts:18.");
    expect(output).toContain("Required change: Verify both outcome branches.");
    expect(output).toContain("Reviewer Decision");
    expect(output).toContain("FIX_ACCEPTED");
  });

  it("uses extracted failure context only when no persisted report exists", () => {
    const presenter = new PreviousCodeReviewFollowUpPresenter(createRepository({
      extract: () => ({
        excerpt: "historical",
        findings: [],
        phaseNumber: 8,
        reportPath: "/archive/prior-review.md",
        reviewResult: "BLOCKED",
      }),
    }));

    const output = presenter.render("/workspace/item", 8, "failure brief");

    expect(output).toContain("Previous review report: /archive/prior-review.md");
    expect(output).toContain("Previous review result: BLOCKED");
    expect(output).not.toContain("Prior findings to verify:");
  });
});
