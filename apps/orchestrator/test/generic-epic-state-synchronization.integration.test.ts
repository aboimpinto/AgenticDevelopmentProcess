import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EpicStateSynchronizationApplication } from "../src/application/epics/epic-state-synchronization-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-epic-state-synchronization.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const runCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/implementation-run-applications.ts", import.meta.url)), "utf8");
const projectCompositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/project-work-item-applications.ts", import.meta.url)), "utf8");

describe("generic EPIC state synchronization Gherkin integration", () => {
  it("specifies normal, ambiguous, and linked synchronization without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds all parent lifecycle callers to the extracted application", () => {
    expect(EpicStateSynchronizationApplication).toBeTypeOf("function");
    expect(projectCompositionSource).toContain("new EpicStateSynchronizationApplication");
    expect(orchestratorSource).toContain("epicStateSynchronizationApplication.syncEpic");
    expect(runCompositionSource).toContain("dependencies.epicState.syncLinkedForFeature");
    expect(orchestratorSource).not.toContain("function syncEpicStateFromCurrentWorkItems");
    expect(orchestratorSource).not.toContain("function syncLinkedEpicStatesForFeature");
  });
});
