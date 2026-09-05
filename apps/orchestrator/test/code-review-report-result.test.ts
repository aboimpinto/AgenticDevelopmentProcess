import { describe, expect, it } from "vitest";
import { parseCodeReviewReportResult } from "../src/code-review-report-result.js";

describe("code-review report result", () => {
  it("recognises the legacy reviewer result label", () => {
    expect(parseCodeReviewReportResult("## Notes\n\nReview Result: NEEDS_CHANGES\n")).toBe("NEEDS_CHANGES");
  });

  it("recognises the authoritative V1 rendered result label", () => {
    expect(parseCodeReviewReportResult("## Safe Review\n\n- **Safe Result:** NEEDS_CHANGES\n")).toBe("NEEDS_CHANGES");
  });

  it("does not route an unrecognised presentation value as an actionable review", () => {
    expect(parseCodeReviewReportResult("Safe Result: FIXES_APPLIED")).toBe("UNKNOWN");
  });
});
