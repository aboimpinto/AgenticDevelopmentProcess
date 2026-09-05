import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildFixerResponseRepairPrompt } from "../src/workflows/prompts/fixer-response-repair-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-fixer-response-repair-prompt.feature", import.meta.url));

describe("generic fixer response repair prompt Gherkin integration", () => {
  it("documents generic report repair without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: Missing canonical responses are repaired");
    expect(specification).toContain("Scenario: Repair cannot become implementation");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("binds an arbitrary repair to its exact report and response identity", () => {
    const prompt = buildFixerResponseRepairPrompt(
      { name: "Any", rootPath: "/root" } as any,
      { externalId: "ITEM", title: "Work" } as any,
      { missingResponseIds: ["R7"], reportPath: "/review.md" },
    );
    expect(prompt).toContain("Edit only this latest review report: /review.md");
    expect(prompt).toContain("Required missing Fixer Response IDs: R7");
    expect(prompt).toContain("reviewer-owned report content is immutable");
  });
});
