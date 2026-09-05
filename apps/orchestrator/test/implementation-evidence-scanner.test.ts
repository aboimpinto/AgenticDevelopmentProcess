import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanFeatureImplementationEvidence } from "../src/memorybank/implementation-evidence-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

describe("implementation evidence scanner", () => {
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
