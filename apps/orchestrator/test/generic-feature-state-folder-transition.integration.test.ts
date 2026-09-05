import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureStateFolderTransition } from "../src/application/features/feature-state-folder-transition.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-state-folder-transition.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const runCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");

describe("generic feature state-folder transition Gherkin integration", () => {
  it("specifies reversible and collision-safe movement without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds start and rollback paths to the extracted transition", () => {
    expect(new FeatureStateFolderTransition()).toBeInstanceOf(FeatureStateFolderTransition);
    expect(runCompositionSource).toContain("dependencies.featureState.moveToInProgress");
    expect(runCompositionSource).toContain("dependencies.featureState.moveBackToReady");
    expect(orchestratorSource).not.toContain("function moveFeatureToInProgress");
    expect(orchestratorSource).not.toContain("function moveFeatureBackToReady");
  });
});
