import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { CodeReviewFailureContextRepository } from "../src/workflows/reviews/code-review-failure-context-repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createFeatureFolder() {
  const folder = mkdtempSync(join(tmpdir(), "hepha-review-context-"));
  temporaryDirectories.push(folder);
  mkdirSync(join(folder, "code-reviews"), { recursive: true });
  return folder;
}

function writeReport(featureFolder: string, name: string, result: string, finding = "contract mismatch") {
  const path = join(featureFolder, "code-reviews", name);
  writeFileSync(path, [
    "# Review",
    "",
    "## Findings",
    "",
    `- REQUIRED: ${finding}`,
    "",
    `Review Result: ${result}`,
  ].join("\n"));
  return path;
}

describe("code review failure context repository", () => {
  it("finds the newest actionable report while ignoring newer infrastructure notes", () => {
    const folder = createFeatureFolder();
    const expected = writeReport(folder, "phase-42-code-review-2026-01-01.md", "NEEDS_CHANGES");
    writeFileSync(join(folder, "code-reviews", "phase-42-code-review-2026-01-02.md"), "harness failed before review");

    expect(new CodeReviewFailureContextRepository().findLatest(folder, 42)).toMatchObject({
      path: expected,
      result: "NEEDS_CHANGES",
    });
  });

  it("extracts all saved report references and selects the lexically newest context", () => {
    const folder = createFeatureFolder();
    const earlier = writeReport(folder, "phase-42-code-review-a.md", "NEEDS_CHANGES", "earlier");
    const later = writeReport(folder, "phase-42-code-review-b.md", "BLOCKED", "later");
    const error = `See ${earlier}\nReview report: ${later}\nSee ${later}`;
    const repository = new CodeReviewFailureContextRepository();

    expect(repository.extractAll(error)).toHaveLength(2);
    expect(repository.extract(error)).toMatchObject({ reportPath: later, reviewResult: "BLOCKED" });
  });

  it("resolves historical failure evidence to the latest actionable on-disk report", () => {
    const folder = createFeatureFolder();
    const stale = writeReport(folder, "phase-42-code-review-a.md", "NEEDS_CHANGES", "stale");
    const current = writeReport(folder, "phase-42-code-review-b.md", "NEEDS_CHANGES", "current");
    const repository = new CodeReviewFailureContextRepository();

    expect(repository.resolve({ folderPath: folder } as never, `See ${stale}`)).toMatchObject({
      reportPath: current,
    });
  });

  it("recognizes a failed review as superseded only when every referenced report has a newer approval", () => {
    const folder = createFeatureFolder();
    const failed = writeReport(folder, "phase-42-code-review-a.md", "NEEDS_CHANGES");
    const repository = new CodeReviewFailureContextRepository();

    expect(repository.isSupersededByApproval(`See ${failed}`)).toBe(false);
    writeReport(folder, "phase-42-code-review-b.md", "APPROVED");
    expect(repository.isSupersededByApproval(`See ${failed}`)).toBe(true);
  });

  it("returns no context for absent evidence and safely handles an absent report directory", () => {
    const folder = createFeatureFolder();
    rmSync(join(folder, "code-reviews"), { recursive: true });
    const repository = new CodeReviewFailureContextRepository();

    expect(repository.extract("no saved review evidence")).toBeNull();
    expect(repository.findLatest(folder, 42)).toBeNull();
    expect(repository.isSupersededByApproval("no saved review evidence")).toBe(false);
  });
});
