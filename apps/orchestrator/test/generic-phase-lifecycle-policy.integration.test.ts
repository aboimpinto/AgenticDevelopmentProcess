import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeImplementationPhaseStatus } from "../src/workflows/phases/phase-lifecycle-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-lifecycle-policy.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic phase lifecycle policy Gherkin integration", () => {
  it("specifies normalization and completion boundaries without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds phase workflow composition to the extracted lifecycle policy", () => {
    expect(normalizeImplementationPhaseStatus("awaiting-code-review")).toBe("AWAITING_REVIEW");
    expect(orchestratorSource).toContain('from "./workflows/phases/phase-lifecycle-policy.js"');
    expect(orchestratorSource).not.toContain("function normalizeImplementationPhaseStatus");
  });
});
