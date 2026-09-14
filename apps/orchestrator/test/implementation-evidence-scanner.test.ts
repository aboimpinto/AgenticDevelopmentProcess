import { mkdirSync, mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFeatureImplementationEvidence } from "../src/memorybank/implementation-evidence-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

describe("implementation evidence scanner", () => {
  it.each(["APPROVED", "NEEDS_CHANGES", "BLOCKED"])("reads the %s review verdict rather than a Decision table heading", verdict => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-review-table-")); roots.push(root);
    const folder = resolve(root, "feature");
    mkdirSync(resolve(folder, "code-reviews/phase-7"), { recursive: true });
    writeFileSync(resolve(folder, "code-reviews/phase-7/review.md"), [
      "# Review", "**Phase**: Phase 7 - Data contracts", `**Status**: ${verdict}`,
      "## Evidence", "| Gate | Decision | Evidence / Justification |", "| --- | --- | --- |",
      "| Tests | satisfied | Recorded execution |",
    ].join("\n"));
    const evidence = scanFeatureImplementationEvidence({ rootPath: root } as StoredProject, folder, []);
    expect(evidence.codeReviews[0]?.result).toBe(verdict.toLowerCase());
  });
  it.each(["APPROVED", "NEEDS_CHANGES", "BLOCKED", "UNKNOWN", "NOT APPROVED"])("indexes nested MCP phase reports with %s verdict without following symlinks", verdict => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-nested-review-")); roots.push(root);
    const featureFolder = resolve(root, "feature");
    const reviewFolder = resolve(featureFolder, "code-reviews/phase-12");
    mkdirSync(reviewFolder, { recursive: true });
    const phasePath = resolve(featureFolder, "phase.md");
    writeFileSync(phasePath, "### Test Verification\n**Commands**: `npm test`\n### Code Review\nRequired for production changes.");
    writeFileSync(resolve(reviewFolder, "report.md"), `# Phase Code Review Report\n**Phase**: Phase 12 - Example\n**Status**: ${verdict}\n## Review Scope\n- \`packages/service.ts\`\n`);
    writeFileSync(resolve(root, "outside.md"), "**Status**: APPROVED");
    symlinkSync(resolve(root, "outside.md"), resolve(reviewFolder, "outside.md"));
    const evidence = scanFeatureImplementationEvidence({ rootPath: root } as StoredProject, featureFolder,
      [{ documentPath: phasePath, number: 12, status: "COMPLETED", title: "Example" } as never]);
    expect(evidence.codeReviews).toHaveLength(1);
    expect(evidence.codeReviews[0]).toMatchObject({ phaseNumber: 12, result: verdict === "NOT APPROVED" ? "unknown" : verdict.toLowerCase() });
    expect(evidence.phaseQualityGates[0]?.gates.find(g => g.gate === "code_review")?.status).toBe(verdict === "APPROVED" ? "satisfied" : "missing");
    expect(evidence.phaseQualityGates[0]?.gates.find(g => g.gate === "tests")?.status).toBe("missing");
  });
  it("merges phase, task-ledger, artifact, and review paths with source lineage", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-evidence-scan-"));
    roots.push(root);
    const featureFolder = resolve(root, "work-item");
    const reviewFolder = resolve(featureFolder, "code-reviews");
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(reviewFolder, { recursive: true });
    mkdirSync(phasesFolder, { recursive: true });
    const phasePath = resolve(phasesFolder, "phase-5-any.md");
    writeFileSync(phasePath, "## Changed Files\n- `packages/service.ts`\n");
    writeFileSync(resolve(featureFolder, "FeatureTasks.md"), "## Phase 5 Active Implementation Evidence\n- `tests/service.test.ts`\n");
    writeFileSync(resolve(featureFolder, "completion-report.md"), "## Files Changed\n- `docs/guide.md`\n");
    writeFileSync(resolve(reviewFolder, "phase-5-code-review.md"), [
      "**Result:** APPROVED",
      "## Scope Reviewed",
      "- `packages/service.ts`",
    ].join("\n"));

    const evidence = scanFeatureImplementationEvidence(
      { rootPath: root } as StoredProject,
      featureFolder,
      [{ documentPath: phasePath, number: 5, status: "COMPLETED", title: "Any" } as never],
    );

    expect(evidence.changedFiles.map((file) => file.path)).toEqual([
      "packages/service.ts",
      "tests/service.test.ts",
      "docs/guide.md",
    ]);
    expect(evidence.changedFiles[0]?.sources).toEqual(["phase", "code-review"]);
    expect(evidence.codeReviews[0]).toEqual(expect.objectContaining({ phaseNumber: 5, result: "approved" }));
  });
});
