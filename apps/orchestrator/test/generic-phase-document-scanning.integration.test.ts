import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scanFeaturePhases } from "../src/memorybank/phase-scanner.js";
import type { StoredProject } from "../src/projects/stored-project.js";

const featurePath = fileURLToPath(new URL("./generic-phase-document-scanning.feature", import.meta.url));
const root = mkdtempSync(resolve(tmpdir(), "hepha-generic-phase-scan-"));

afterAll(() => rmSync(root, { force: true, recursive: true }));

describe("generic phase document scanning Gherkin integration", () => {
  it("binds the generic scenario without fixed phase names", () => {
    const feature = readFileSync(featurePath, "utf8");
    expect(feature).toContain("Scenario: Arbitrarily named phase files are scanned in declared numeric order");
    expect(feature).not.toMatch(/FEAT-\d+|Data Layer|Business Logic|Presentation Logic/i);
  });

  it("scans arbitrary names in numeric prefix order through the production scanner", () => {
    const featureFolder = resolve(root, "work-item");
    const phasesFolder = resolve(featureFolder, "Phases");
    mkdirSync(phasesFolder, { recursive: true });
    writeFileSync(resolve(phasesFolder, "phase-8-orange-sky.md"), [
      "# Phase 8: Orange Sky",
      "**Status:** PENDING",
      "**Recommended Agent:** reviewer",
    ].join("\n"));
    writeFileSync(resolve(phasesFolder, "phase-2-blue-ocean.md"), [
      "# Phase 2: Blue Ocean",
      "**Status:** COMPLETED",
      "**Estimated AI Time:** 20m",
    ].join("\n"));

    const phases = scanFeaturePhases({ rootPath: root } as StoredProject, featureFolder);

    expect(phases.map((phase) => phase.number)).toEqual([2, 8]);
    expect(phases.map((phase) => phase.title)).toEqual(["Blue Ocean", "Orange Sky"]);
    expect(phases[0]).toEqual(expect.objectContaining({ estimatedAiTime: "20m", status: "COMPLETED" }));
    expect(phases[1]).toEqual(expect.objectContaining({ recommendedAgent: "reviewer", status: "PENDING" }));
  });
});
