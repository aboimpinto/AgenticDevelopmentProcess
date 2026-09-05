import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildStartImplementingPrompt,
  classifyNoUiMaintenanceFeature,
} from "../src/workflows/prompts/feature-entry-prompts.js";

const featurePath = fileURLToPath(new URL("./generic-feature-entry-prompts.feature", import.meta.url));

describe("generic feature-entry prompt Gherkin integration", () => {
  it("documents generic entry routing without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Non-visual command maintenance enters without design work");
    expect(specification).toContain("Scenario: Explicit visual work uses the UI decision contract");
    expect(specification).toContain("Scenario: Feature skills receive canonical project identity");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("routes arbitrary command maintenance and preserves canonical autonomous targeting", () => {
    const workItem = { externalId: "ITEM-X", title: "Internal routing", specMarkdown: "Update slash command metadata." } as any;
    expect(classifyNoUiMaintenanceFeature(workItem)?.decision).toBe("no_ui");
    expect(buildStartImplementingPrompt(
      { name: "Project", rootPath: "/project", memoryBankPath: "/project/bank" } as any,
      workItem,
      "context",
      { autonomous: true, branchMessage: "", branchName: "" },
    )).toBe("Use the start-feature skill for Project ITEM-X autonomous. Project root: /project. MemoryBank: /project/bank.");
  });
});
