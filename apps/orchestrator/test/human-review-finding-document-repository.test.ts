import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  HumanReviewFindingDocumentRepository,
  extractFindingTasksBlock,
  getHumanReviewFindingSections,
} from "../src/application/features/human-review-finding-document-repository.js";
import type { WorkItemCard } from "@hepha/shared";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function createFeature(): WorkItemCard {
  const folderPath = mkdtempSync(resolve(tmpdir(), "hepha-human-findings-"));
  roots.push(folderPath);
  mkdirSync(resolve(folderPath, "Phases"));
  writeFileSync(resolve(folderPath, "FeatureTasks.md"), [
    "# Work item tasks",
    "",
    "| Phase | Title | Objective | Status | Depends On |",
    "| --- | --- | --- | --- | --- |",
    "| 4 | Arbitrary delivery | Work | COMPLETED | None |",
    "",
  ].join("\n"));
  return {
    externalId: "WORK-ITEM",
    folderPath,
    phases: [{ number: 4, title: "Arbitrary delivery" }],
  } as WorkItemCard;
}

describe("HumanReviewFindingDocumentRepository", () => {
  it("creates one next-numbered phase and projects it into the feature task table", () => {
    const feature = createFeature();
    const repository = new HumanReviewFindingDocumentRepository(() => "2032-04-05T06:07:08.000Z");

    const first = repository.ensurePhase(feature);
    const second = repository.ensurePhase(feature);

    expect(second).toEqual(first);
    expect(first.number).toBe(5);
    expect(readFileSync(first.path, "utf8")).toContain("# Phase 5: Human Review Findings");
    expect(readFileSync(first.path, "utf8")).toContain("**Created:** 2032-04-05T06:07:08.000Z");
    expect(readFileSync(resolve(feature.folderPath, "FeatureTasks.md"), "utf8")).toContain(
      "| 5 | Human Review Findings |",
    );
  });

  it("records finding detail, agent evidence, and user resolution in the same phase", () => {
    const feature = createFeature();
    const repository = new HumanReviewFindingDocumentRepository(() => "2032-04-05T06:07:08.000Z");
    const phase = repository.ensurePhase(feature);

    repository.appendFinding(phase, {
      content: "An arbitrary behavior is incorrect.",
      findingId: "finding-random",
      submittedAt: "2032-04-05T05:00:00.000Z",
    });
    repository.appendDetail(phase, {
      content: "The failure also occurs after a restart.",
      findingId: "finding-random",
      submittedAt: "2032-04-05T05:30:00.000Z",
    });
    repository.appendAgentResult(
      feature,
      "finding-random",
      "Finding Result: READY_FOR_USER\nConfigured verification evidence: tests passed.",
      "AWAITING_USER_ACCEPTANCE",
    );

    const awaitingMarkdown = readFileSync(phase.path, "utf8");
    expect(repository.isAwaitingUser(phase)).toBe(true);
    expect(getHumanReviewFindingSections(awaitingMarkdown)).toHaveLength(1);
    expect(extractFindingTasksBlock(awaitingMarkdown)).not.toMatch(/^\s*-\s+\[ \]/m);
    expect(awaitingMarkdown).toContain("The failure also occurs after a restart.");
    expect(awaitingMarkdown).toContain("Configured verification evidence: tests passed.");

    repository.markSolved(feature, "finding-random");
    expect(readFileSync(phase.path, "utf8")).toContain("User marked this finding as solved.");
    expect(readFileSync(phase.path, "utf8")).toContain("**Status:** COMPLETED");
  });

  it("upgrades an existing findings document with the generic verification contract and task checklist", () => {
    const feature = createFeature();
    const path = resolve(feature.folderPath, "Phases", "phase-9-random-name.md");
    writeFileSync(path, [
      "# Phase 9: Human Review Findings",
      "**Status:** AWAITING_USER_ACCEPTANCE",
      "## Findings",
      "### finding-old",
      "**Status:** AWAITING_USER_ACCEPTANCE",
      "#### Agent Response",
      "A response exists.",
    ].join("\n"));
    const repository = new HumanReviewFindingDocumentRepository();

    const phase = repository.ensurePhase(feature);
    const markdown = readFileSync(phase.path, "utf8");

    expect(phase.path).toBe(path);
    expect(markdown).toContain("## Verification Intent");
    expect(markdown).toContain("**Finding Tasks:**");
    expect(extractFindingTasksBlock(markdown)).not.toMatch(/^\s*-\s+\[ \]/m);
  });

  it("accepts the phase by closing every finding and synchronizing all checkpoints", () => {
    const feature = createFeature();
    const repository = new HumanReviewFindingDocumentRepository(() => "2032-04-05T06:07:08.000Z");
    const phase = repository.ensurePhase(feature);
    repository.appendFinding(phase, {
      content: "One final arbitrary concern.",
      findingId: "finding-final",
      submittedAt: "2032-04-05T05:00:00.000Z",
    });

    repository.acceptPhase(feature, phase);

    const markdown = readFileSync(phase.path, "utf8");
    expect(markdown).toContain("User accepted the Human Review Findings phase");
    expect(markdown.match(/^- \[x\]/gm)).toHaveLength(9);
    expect(readFileSync(resolve(feature.folderPath, "FeatureTasks.md"), "utf8")).toContain(
      "| COMPLETED |",
    );
    expect(repository.findPhase(feature)).toEqual(phase);
  });
});
