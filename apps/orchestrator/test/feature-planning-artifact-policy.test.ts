import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeaturePlanningArtifactPolicy } from "../src/workflows/phases/feature-planning-artifact-policy.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  while (temporaryDirectories.length > 0) rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
});

function fixture(role: "planning" | "implementation" | null = "planning") {
  const folderPath = mkdtempSync(join(tmpdir(), "hepha-planning-artifact-"));
  temporaryDirectories.push(folderPath);
  mkdirSync(join(folderPath, "Phases"));
  const getContractPhase = vi.fn(() => role ? ({ role }) as never : null);
  const policy = new FeaturePlanningArtifactPolicy({
    artifactFileName: "planning-analysis-report.md",
    exists: (path) => {
      try { return readFileSync(path).length >= 0; } catch { return false; }
    },
    getContractPhase,
    readSnippet: (path, max) => readFileSync(path, "utf8").slice(0, max),
  });
  const feature = { folderPath };
  const phase = { documentPath: join(folderPath, "Phases", "phase-arbitrary.md"), number: 47, status: "PENDING" };
  return { feature, folderPath, getContractPhase, phase, policy };
}

describe("feature planning artifact policy", () => {
  it("prefers the established non-empty phase-folder artifact", () => {
    const current = fixture();
    const phasePath = join(current.folderPath, "Phases", "planning-analysis-report.md");
    writeFileSync(phasePath, "# Planning handoff");
    writeFileSync(join(current.folderPath, "planning-analysis-report.md"), "# Root copy");
    expect(current.policy.getPath(current.feature)).toBe(phasePath);
    expect(current.policy.has(current.feature)).toBe(true);
  });

  it("uses the root target when the historical phase artifact is absent or empty", () => {
    const current = fixture();
    writeFileSync(join(current.folderPath, "Phases", "planning-analysis-report.md"), "   ");
    const rootPath = join(current.folderPath, "planning-analysis-report.md");
    expect(current.policy.getPath(current.feature)).toBe(rootPath);
    expect(current.policy.has(current.feature)).toBe(false);
    expect(() => current.policy.assertPresent(current.feature)).toThrow(rootPath);
  });

  it("uses the declared role and retains the legacy first-phase fallback", () => {
    const declared = fixture("planning");
    expect(declared.policy.isPlanningPhase(declared.feature, declared.phase)).toBe(true);
    const implementation = fixture("implementation");
    expect(implementation.policy.isPlanningPhase(implementation.feature, implementation.phase)).toBe(false);
    const legacy = fixture(null);
    expect(legacy.policy.isPlanningPhase(legacy.feature, { ...legacy.phase, number: 1 })).toBe(true);
  });

  it("does not require an artifact from a skipped planning phase", () => {
    const current = fixture();
    expect(current.policy.isMissing(current.feature, { ...current.phase, status: "SKIPPED" })).toBe(false);
    expect(current.policy.isMissing(current.feature, current.phase)).toBe(true);
  });
});
