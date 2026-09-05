import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractPhaseBlockerSummary,
  getMarkdownChecklistStats,
  PhaseCompletionEvidenceReader,
} from "../src/workflows/phases/phase-completion-evidence-reader.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function createPhase(status: string, markdown?: string) {
  const folder = mkdtempSync(join(tmpdir(), "hepha-phase-evidence-"));
  const documentPath = join(folder, "arbitrary-phase.md");
  temporaryDirectories.push(folder);
  if (markdown !== undefined) writeFileSync(documentPath, markdown);
  return {
    documentPath,
    documentRelativePath: "Phases/arbitrary-phase.md",
    fileName: "arbitrary-phase.md",
    number: 81,
    status,
    title: "Arbitrary delivery",
  } as never;
}

describe("phase completion evidence reader", () => {
  it("accepts only completed phases whose declared checklists are resolved", () => {
    const reader = new PhaseCompletionEvidenceReader();

    expect(reader.has(createPhase("COMPLETED", "# Work\n\nNo checklist."))).toBe(true);
    expect(reader.has(createPhase("COMPLETED", "- [x] code\n- [X] tests\n- [-] waived"))).toBe(true);
    expect(reader.has(createPhase("COMPLETED", "- [x] code\n- [ ] tests"))).toBe(false);
    expect(reader.has(createPhase("IN_PROGRESS", "- [x] code"))).toBe(false);
    expect(reader.has(createPhase("COMPLETED"))).toBe(false);
  });

  it("explains missing, blocked, incomplete, and insufficient phase evidence", () => {
    const reader = new PhaseCompletionEvidenceReader();

    expect(reader.summarize(createPhase("COMPLETED"))).toContain("document was not found");
    expect(reader.summarize(createPhase("BLOCKED", "Blocked: dependency unavailable"))).toContain(
      "is blocked: Blocked: dependency unavailable",
    );
    expect(reader.summarize(createPhase("IN_PROGRESS", "work continues"))).toContain("not COMPLETED");
    expect(reader.summarize(createPhase("COMPLETED", "- [x] code\n- [ ] tests"))).toContain("1/2 unchecked");
    expect(reader.summarize(createPhase("COMPLETED", "no checklist"))).toContain("insufficient completion evidence");
  });

  it("requires task and response evidence for every human-review finding", () => {
    const reader = new PhaseCompletionEvidenceReader();
    const complete = createPhase("COMPLETED", [
      "### finding-generic",
      "",
      "**Finding Tasks:**",
      "",
      "- [x] Triage and resolve the concern.",
      "",
      "#### Agent Response",
      "",
      "Verified correction.",
    ].join("\n"));

    expect(reader.summarizeHumanReview(complete)).toEqual({
      message: "Phase 81 has finding task and response evidence.",
      ok: true,
    });
    expect(reader.summarizeHumanReview(createPhase("IN_PROGRESS", "### finding-generic\n\ntext"))).toMatchObject({
      message: expect.stringContaining("has no task checklist"),
      ok: false,
    });
    expect(reader.summarizeHumanReview(createPhase("IN_PROGRESS", "### finding-generic\n\n**Finding Tasks:**\n\n- [ ] resolve"))).toMatchObject({
      message: expect.stringContaining("unchecked finding tasks"),
      ok: false,
    });
    expect(reader.summarizeHumanReview(createPhase("IN_PROGRESS", "### finding-generic\n\n**Finding Tasks:**\n\n- [x] resolve"))).toMatchObject({
      message: expect.stringContaining("has no agent response"),
      ok: false,
    });
    expect(reader.summarizeHumanReview(createPhase("IN_PROGRESS", "no findings"))).toMatchObject({
      message: expect.stringContaining("no recorded finding sections"),
      ok: false,
    });
  });

  it("counts checklist decisions and bounds blocker summaries", () => {
    expect(getMarkdownChecklistStats("- [x] one\n* [ ] two\n- [-] three")).toEqual({
      checked: 2,
      total: 3,
      unchecked: 1,
    });
    expect(extractPhaseBlockerSummary("note\n- Validation Blocker: waiting for evidence")).toBe(
      "Validation Blocker: waiting for evidence",
    );
    expect(extractPhaseBlockerSummary("ordinary note")).toBeNull();
    expect(extractPhaseBlockerSummary(`Blocker: ${"x".repeat(800)}`)?.length).toBe(702);
  });
});
