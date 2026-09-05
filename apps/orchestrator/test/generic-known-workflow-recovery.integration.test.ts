import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { prepareKnownWorkflowRecovery } from "../src/workflows/recovery/known-workflow-recovery-preparer.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-known-workflow-recovery.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const recoveryCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/implementation-recovery-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic known workflow recovery Gherkin integration", () => {
  it("specifies deterministic, infrastructure-assisted, and unknown recovery paths", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds autonomous recovery to the extracted preparer and injected host effects", () => {
    const plan = prepareKnownWorkflowRecovery("cargo: command not found", {
      ensureCargoShimDirectory: vi.fn(() => "/temporary/shim"),
      findCodeReviewContext: vi.fn(() => null),
      formatMissingPi: vi.fn(() => "missing Pi"),
      resolvePi: vi.fn(() => ({ diagnostics: [], invocation: null })),
    });

    expect(plan.canRetry).toBe(true);
    expect(recoveryCompositionSource).toContain('from "../workflows/recovery/known-workflow-recovery-preparer.js"');
    expect(orchestratorSource).toContain("ensureCargoShimDirectory: ensurePiCargoShimDirectory");
    expect(orchestratorSource).not.toContain("function prepareKnownWorkflowRecovery");
  });
});
