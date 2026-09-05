import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PhaseSummary } from "@hepha/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  CodeReviewReportWriter,
  stripMarkdownFence,
} from "../src/workflows/reviews/code-review-report-writer.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

describe("code-review report writer", () => {
  it("creates a timestamped phase report and its missing directory", () => {
    const folderPath = mkdtempSync(join(tmpdir(), "hepha-review-report-"));
    temporaryDirectories.push(folderPath);
    const writer = new CodeReviewReportWriter({ now: () => new Date("2031-04-05T06:07:08.009Z") });
    const reportPath = writer.write(
      { folderPath },
      { number: 47, title: "Arbitrary phase" } as PhaseSummary & { number: number },
      "# Review\n\nReview Result: APPROVED",
    );

    expect(reportPath).toBe(join(folderPath, "code-reviews", "phase-47-code-review-2031-04-05T06-07-08-009Z.md"));
    expect(existsSync(reportPath)).toBe(true);
    expect(readFileSync(reportPath, "utf8")).toBe("# Review\n\nReview Result: APPROVED\n");
  });

  it("removes only a complete outer Markdown fence and normalizes the trailing newline", () => {
    expect(stripMarkdownFence("```markdown\n# Review\n```")).toBe("# Review");
    expect(stripMarkdownFence("before\n```md\ninside\n```")).toBe("before\n```md\ninside\n```");
  });
});
