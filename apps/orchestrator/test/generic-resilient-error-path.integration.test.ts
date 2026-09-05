import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderResilientImplementationErrorPath } from "../src/workflows/prompts/resilient-error-path.js";

const featurePath = fileURLToPath(new URL("./generic-resilient-error-path.feature", import.meta.url));

describe("generic resilient error path Gherkin integration", () => {
  it("documents generic recovery without fixed workflow identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A recoverable operation fails");
    expect(specification).toContain("Scenario: Recovery needs external authority");
    expect(specification).toContain("Scenario: The same failure survives documented recovery");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("injects arbitrary completion and escalation targets into the shared policy", () => {
    const rules = renderResilientImplementationErrorPath({
      blockedEscalation: "Return WAITING",
      completionTarget: "the declared checkpoint passes",
    }).join("\n");
    expect(rules).toContain("until the error is resolved and the declared checkpoint passes");
    expect(rules).toContain("Return WAITING only when");
  });
});
