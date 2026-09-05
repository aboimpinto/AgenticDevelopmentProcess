import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanFeatureImplementationEvidence } from "../src/memorybank/implementation-evidence-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-implementation-evidence.feature", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "hepha-generic-evidence-"));
afterAll(() => rmSync(root, { force: true, recursive: true }));

describe("generic implementation evidence Gherkin integration", () => {
  it("binds a generic evidence scenario", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Declared evidence is merged with auditable source lineage");
    expect(feature).not.toMatch(/FEAT-\d+|Data Layer|Business Logic/i);
  });

  it("merges declared evidence through the production scanner", () => {
    const folder = resolve(root, "item");
    mkdirSync(resolve(folder, "code-reviews"), { recursive: true });
    mkdirSync(resolve(folder, "Phases"), { recursive: true });
    const phasePath = resolve(folder, "Phases", "phase-6-any.md");
    writeFileSync(phasePath, "## Changed Files\n- `packages/runtime.ts`\n## Quality Gate Evidence\n| tests | WAIVED | docs-only fixture |\n| code review | SATISFIED | recorded |\n");
    writeFileSync(resolve(folder, "FeatureTasks.md"), "## Phase 6 Implementation Evidence\n- `packages/runtime.ts`\n");
    writeFileSync(resolve(folder, "code-reviews", "phase-6-code-review.md"), "**Result:** APPROVED\n## Scope Reviewed\n- `packages/runtime.ts`\n");

    const evidence = scanFeatureImplementationEvidence(
      { rootPath: root } as StoredProject,
      folder,
      [{ documentPath: phasePath, number: 6, status: "COMPLETED", title: "Unrelated" } as never],
    );

    expect(evidence.changedFiles).toEqual([
      expect.objectContaining({ path: "packages/runtime.ts", phases: [6], sources: ["phase", "code-review", "task-ledger"] }),
    ]);
    expect(evidence.codeReviews[0]).toEqual(expect.objectContaining({ phaseNumber: 6, result: "approved" }));
    expect(evidence.phaseQualityGates[0]).toEqual(expect.objectContaining({ phaseNumber: 6 }));
  });
});
