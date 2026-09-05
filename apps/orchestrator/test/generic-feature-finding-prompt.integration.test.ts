import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildFeatureFindingPrompt,
  renderFindingThread,
} from "../src/workflows/prompts/feature-finding-prompt.js";

const featurePath = fileURLToPath(new URL("./generic-feature-finding-prompt.feature", import.meta.url));

describe("generic human-review finding prompt Gherkin integration", () => {
  it("specifies repair, no-change, thread, and human-gate behavior without fixed identities", () => {
    const specification = readFileSync(featurePath, "utf8");
    expect(specification).toContain("Scenario: A finding reports missing behavior");
    expect(specification).toContain("Scenario: A finding confirms the behavior works");
    expect(specification).toContain("Scenario: A finding has a durable discussion thread");
    expect(specification).not.toMatch(/FEAT-\d+|Phase \d+|dashboard|governance/i);
  });

  it("exports the production composer and thread renderer", () => {
    expect(typeof buildFeatureFindingPrompt).toBe("function");
    expect(typeof renderFindingThread).toBe("function");
  });
});
