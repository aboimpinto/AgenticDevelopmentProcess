import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createOrchestratorRuntimeSettings } from "../src/bootstrap/orchestrator-runtime-settings.js";
import { createPiOneShotPromptRunner } from "../src/runtime/pi/pi-one-shot-runner.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-implementation-worker-progress-liveness.feature", import.meta.url)),
  "utf8",
);
const runnerSource = readFileSync(
  fileURLToPath(new URL("../src/runtime/pi/pi-one-shot-runner.ts", import.meta.url)),
  "utf8",
);

const workspaceRoot = fileURLToPath(new URL("../../..", import.meta.url));

describe("generic implementation worker progress liveness", () => {
  it("defines progress, silence, and explicit-maximum behavior without workflow-specific identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/iu);
    expect(feature).toContain("each activity event resets the stall circuit");
    expect(feature).toContain("no observable Pi or tool output changes");
    expect(feature).toContain("explicit absolute safety cap");
  });

  it("binds the behavior to the production runner and stall-only implementation defaults", () => {
    const settings = createOrchestratorRuntimeSettings({ cwd: workspaceRoot, environment: {} });

    expect(createPiOneShotPromptRunner).toBeTypeOf("function");
    expect(settings.implementationIdleTimeoutMs).toBe(1_800_000);
    expect(settings.implementationRunTimeoutMs).toBeNull();
    expect(runnerSource).toContain("resetStallTimeout();");
    expect(runnerSource).toContain("child.stdout.on");
    expect(runnerSource).toContain("child.stderr.on");
  });
});
