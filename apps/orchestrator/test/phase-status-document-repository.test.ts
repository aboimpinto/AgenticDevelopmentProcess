import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  PhaseStatusDocumentRepository,
  replaceImplementationPhaseStatusLine,
  updateFeatureTasksPhaseStatus,
} from "../src/workflows/phases/phase-status-document-repository.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createDocuments(markdown = "**Status:** IN_PROGRESS\n\n## Phase Task Ledger\n\n- [x] Work\n\n| Gate | Decision | Evidence |\n| --- | --- | --- |\n| Code review | missing | Pending |\n") {
  const folder = mkdtempSync(join(tmpdir(), "hepha-phase-status-"));
  temporaryDirectories.push(folder);
  const phases = join(folder, "Phases");
  mkdirSync(phases, { recursive: true });
  const documentPath = join(phases, "phase-42-any-title.md");
  writeFileSync(documentPath, markdown);
  const featureTasksPath = join(folder, "FeatureTasks.md");
  writeFileSync(featureTasksPath, "| Phase | Title | Status |\n| --- | --- | --- |\n| 42 | Any title | IN_PROGRESS |\n| 43 | Other | PENDING |\n");
  return {
    documentPath,
    featureTasksPath,
    folder,
    phase: { documentPath, number: 42, status: "IN_PROGRESS", title: "Any title" } as never,
  };
}

describe("phase status document repository", () => {
  it("replaces a standalone status or inserts one when absent", () => {
    expect(replaceImplementationPhaseStatusLine("**Status:** PENDING\n\nbody", "COMPLETED"))
      .toBe("**Status:** COMPLETED\n\nbody\n");
    expect(replaceImplementationPhaseStatusLine("# Phase\n\nbody", "AWAITING_REVIEW"))
      .toBe("**Status:** AWAITING_REVIEW\n\n# Phase\n\nbody");
  });

  it("updates only the matching FeatureTasks status cell", () => {
    const documents = createDocuments();
    updateFeatureTasksPhaseStatus(documents.featureTasksPath, 42, "COMPLETED");
    const markdown = readFileSync(documents.featureTasksPath, "utf8");

    expect(markdown).toContain("| 42 | Any title | COMPLETED |");
    expect(markdown).toContain("| 43 | Other | PENDING |");
  });

  it("updates a contract inventory row through its arbitrary document name", () => {
    const documents = createDocuments();
    writeFileSync(documents.featureTasksPath, [
      "| Contract ID | Document | Role | Status |",
      "| --- | --- | --- | --- |",
      "| arbitrary | `Phases/phase-42-any-title.md` | implementation | IN_PROGRESS |",
      "| another | `Phases/phase-43-other.md` | integration | PENDING |",
    ].join("\n"));

    updateFeatureTasksPhaseStatus(documents.featureTasksPath, 42, "COMPLETED");
    const markdown = readFileSync(documents.featureTasksPath, "utf8");
    expect(markdown).toContain("| arbitrary | `Phases/phase-42-any-title.md` | implementation | COMPLETED |");
    expect(markdown).toContain("| another | `Phases/phase-43-other.md` | integration | PENDING |");
  });

  it("marks a phase complete in both durable documents", () => {
    const documents = createDocuments();
    new PhaseStatusDocumentRepository().markCompleted(documents.folder, documents.phase);

    expect(readFileSync(documents.documentPath, "utf8")).toContain("**Status:** COMPLETED");
    expect(readFileSync(documents.featureTasksPath, "utf8")).toContain("| 42 | Any title | COMPLETED |");
  });

  it("recognizes only a non-empty fully checked declared task ledger", () => {
    const complete = createDocuments([
      "**Status:** COMPLETED", "", "## Phase Task Ledger", "", "- [x] Done", "", "## Phase Checkpoint", "", "- [ ] All declared phase tasks completed", "- [ ] Ready for next phase",
    ].join("\n"));
    const incomplete = createDocuments("**Status:** IN_PROGRESS\n\n## Phase Task Ledger\n\n- [x] Done\n- [ ] Pending\n\n## Phase Checkpoint\n\n- [x] Ready for next phase\n");
    const empty = createDocuments("**Status:** IN_PROGRESS\n\n## Phase Task Ledger\n\n## Phase Checkpoint\n\n- [x] Ready for next phase\n");
    const legacy = createDocuments("**Status:** IN_PROGRESS\n\n- [x] Legacy work\n");
    const repository = new PhaseStatusDocumentRepository();

    expect(repository.hasCheckedTaskLedger(complete.phase)).toBe(true);
    expect(repository.hasCheckedTaskLedger(incomplete.phase)).toBe(false);
    expect(repository.hasCheckedTaskLedger(empty.phase)).toBe(false);
    expect(repository.hasCheckedTaskLedger(legacy.phase)).toBe(true);
  });

  it("records an awaiting-review rerun idempotently in phase and feature documents", () => {
    const documents = createDocuments();
    const repository = new PhaseStatusDocumentRepository();

    repository.markAwaitingReviewRerun(documents.folder, documents.phase);
    repository.markAwaitingReviewRerun(documents.folder, documents.phase);
    const markdown = readFileSync(documents.documentPath, "utf8");
    expect(markdown).toContain("**Status:** AWAITING_REVIEW");
    expect(markdown).toContain("Fixer responses are complete; awaiting an independent code-review rerun.");
    expect(readFileSync(documents.featureTasksPath, "utf8")).toContain("| 42 | Any title | AWAITING_REVIEW |");
  });

  it("rejects a rerun state when the phase has no writable review gate", () => {
    const documents = createDocuments("**Status:** IN_PROGRESS\n\n- [x] Work\n");
    expect(() => new PhaseStatusDocumentRepository().markAwaitingReviewRerun(documents.folder, documents.phase))
      .toThrow("has no writable Code review Quality Gate Evidence row");
  });

  it("records the approved report in the review quality gate", () => {
    const documents = createDocuments();
    new PhaseStatusDocumentRepository().recordApprovedReviewEvidence(
      documents.phase,
      join(documents.folder, "code-reviews", "review-any.md"),
    );

    const markdown = readFileSync(documents.documentPath, "utf8");
    expect(markdown).toMatch(/\| Code review \|\s+satisfied \| Approved code review report: `code-reviews\/review-any\.md`\./);
  });

  it("detects rerun evidence from phase status, phase prose, or the matching FeatureTasks row", () => {
    const documents = createDocuments();
    const repository = new PhaseStatusDocumentRepository();
    expect(repository.isAwaitingReviewRerun({ ...documents.phase, status: "AWAITING REVIEW RERUN" })).toBe(true);

    writeFileSync(documents.documentPath, "Review fixes applied and verified.\n");
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(true);

    writeFileSync(documents.documentPath, "ordinary phase prose\n");
    writeFileSync(documents.featureTasksPath, "| Phase | Status |\n| 42 | Awaiting code review rerun |\n");
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(true);
  });

  it("falls back to session JSON when the phase document has no review-ready text", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session-1.json"), JSON.stringify({ content: "awaiting code review rerun" }));
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(true);
  });

  it("returns false from session fallback when no session file contains review-ready text", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(join(sessionDir, "session-1.json"), JSON.stringify({ content: "phase running normally" }));
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(false);
  });

  it("returns false from session fallback when the session directory does not exist", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "missing-sessions");
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(false);
  });

  it("returns false from session fallback when no session directory is configured", () => {
    const documents = createDocuments();
    const repository = new PhaseStatusDocumentRepository();
    // The document has no review-ready text, so it falls through to session check which returns false
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(false);
  });

  it("skips non-JSON files when scanning session files for review-ready text", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    // Non-JSON file with matching text should be skipped
    writeFileSync(join(sessionDir, "session.txt"), "awaiting code review rerun");
    // JSON file without matching text
    writeFileSync(join(sessionDir, "session-1.json"), JSON.stringify({ content: "normal phase work" }));
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(false);
  });

  it("handles session file read errors gracefully without failing the rerun check", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    // Create a valid JSON file with matching text
    writeFileSync(join(sessionDir, "session-valid.json"), JSON.stringify({ content: "awaiting code review rerun" }));
    // Create an unreadable file (directory with same name to cause ENOTDIR error)
    mkdirSync(join(sessionDir, "session-broken.json"));
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    // Should survive the read error and still find the valid session
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(true);
  });

  it("limits session file scan to the 10 most recent JSON files", () => {
    const documents = createDocuments();
    const sessionDir = join(documents.folder, ".hepha", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    // Create 12 session files, with matching text only in the 12th (oldest)
    for (let i = 1; i <= 12; i += 1) {
      const content = i === 12
        ? JSON.stringify({ content: "awaiting code review rerun" })
        : JSON.stringify({ content: "normal phase work" });
      writeFileSync(join(sessionDir, `session-${String(i).padStart(3, "0")}.json`), content);
    }
    const repository = new PhaseStatusDocumentRepository({ sessionDirectory: sessionDir });
    // Only the 10 most recent (sessions 3-12) are scanned; session 12 is the 10th most recent
    expect(repository.isAwaitingReviewRerun(documents.phase)).toBe(true);
  });
});
