import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createOrchestratorRuntimeSettings } from "../src/bootstrap/orchestrator-runtime-settings.js";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("orchestrator runtime settings", () => {
  it("uses stable numeric defaults and workspace-relative state paths", () => {
    const settings = createOrchestratorRuntimeSettings({ cwd: workspaceRoot, environment: {} });
    expect(settings.port).toBe(4317);
    expect(settings.runTimeoutMs).toBe(180000);
    expect(settings.implementationIdleTimeoutMs).toBe(1800000);
    expect(settings.implementationRunTimeoutMs).toBeNull();
    expect(settings.refineFeatureStallTimeoutMs).toBe(900000);
    expect(settings.refineFeatureMaxRuntimeMs).toBeNull();
    expect(settings.refineFeatureMaxRuntimeSource).toBe("disabled");
    expect(settings.localStateDir).toBe(resolve(workspaceRoot, ".hepha"));
  });

  it("uses an explicit implementation maximum only when the operator configures one", () => {
    expect(createOrchestratorRuntimeSettings({
      cwd: workspaceRoot,
      environment: { HEPHA_PI_IMPLEMENTATION_MAX_RUNTIME_MS: "10800000" },
    }).implementationRunTimeoutMs).toBe(10800000);
  });

  it("uses an explicit refinement maximum and preserves the legacy setting as compatibility input", () => {
    expect(createOrchestratorRuntimeSettings({
      cwd: workspaceRoot,
      environment: { HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS: "3600000" },
    }).refineFeatureMaxRuntimeMs).toBe(3600000);
    const legacy = createOrchestratorRuntimeSettings({
      cwd: workspaceRoot,
      environment: { HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS: "1200000" },
    });
    expect(legacy.refineFeatureMaxRuntimeMs).toBe(1200000);
    expect(legacy.refineFeatureMaxRuntimeSource).toBe("legacy");
  });

  it("bounds fixer response repair attempts by the absolute safety cap", () => {
    const settings = createOrchestratorRuntimeSettings({
      cwd: workspaceRoot,
      environment: {
        HEPHA_FINGERPRINT_ABSOLUTE_SAFETY_CAP: "5",
        HEPHA_FIXER_RESPONSE_REPAIR_ATTEMPTS: "12",
      },
    });
    expect(settings.fingerprintAbsoluteSafetyCap).toBe(5);
    expect(settings.maxFixerResponseRepairAttempts).toBe(5);
  });

  it("rejects startup when the authoritative portable inventory is missing", () => {
    const root = mkdtempSync(resolve(tmpdir(), "hepha-settings-missing-inventory-"));
    expect(() => createOrchestratorRuntimeSettings({ cwd: root, environment: {} }))
      .toThrow(/PORTABLE_ASSET_INVALID: Portable model-authority inventory is invalid/);
  });

  it("returns only configured implementation skill paths", () => {
    const startSkill = resolve(workspaceRoot, "pi-packages/pi-skill-hepha-continue-implementation/skills/start-feature/SKILL.md");
    const settings = createOrchestratorRuntimeSettings({
      cwd: workspaceRoot,
      environment: { HEPHA_START_FEATURE_SKILL_PATH: startSkill },
    });
    expect(settings.implementationSkillPaths).toContain(startSkill);
    expect(settings.implementationSkillPaths.every(Boolean)).toBe(true);
  });
});
