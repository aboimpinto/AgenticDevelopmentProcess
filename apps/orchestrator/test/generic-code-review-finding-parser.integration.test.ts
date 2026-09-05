import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractCodeReviewFindings } from "../src/workflows/reviews/code-review-finding-parser.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-code-review-finding-parser.feature", import.meta.url)),
  "utf8",
);
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const reviewCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-review-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic code review finding parser Gherkin integration", () => {
  it("specifies structured, tabular, and informal report shapes generically", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds the live workflow to the extracted parser", () => {
    expect(extractCodeReviewFindings("## Findings\n- BLOCKER: arbitrary failure")).toHaveLength(1);
    expect(orchestratorSource).toContain("createPhaseReviewApplications({");
    expect(reviewCompositionSource).toContain('from "../workflows/reviews/code-review-finding-parser.js"');
    expect(reviewCompositionSource).toContain("extractCodeReviewFindings(reportMarkdown)");
    expect(orchestratorSource).not.toContain("function extractCodeReviewFindings");
  });
});
