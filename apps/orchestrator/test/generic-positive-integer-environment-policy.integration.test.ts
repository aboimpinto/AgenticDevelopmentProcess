import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readPositiveIntegerEnvironment } from "../src/runtime/positive-integer-environment-policy.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-positive-integer-environment-policy.feature", import.meta.url)), "utf8");
const root = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const settings = readFileSync(fileURLToPath(new URL("../src/bootstrap/orchestrator-runtime-settings.ts", import.meta.url)), "utf8");

describe("generic positive integer environment policy Gherkin integration", () => {
  it("specifies valid and fallback behavior without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(2);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });
  it("is the root runtime configuration seam", () => {
    expect(readPositiveIntegerEnvironment("5", 1)).toBe(5);
    expect(root).toContain("createOrchestratorRuntimeSettings({ cwd: process.cwd() })");
    expect(settings).toContain("readPositiveIntegerEnvironment(");
    expect(root).not.toContain("function readPositiveIntegerEnv");
  });
});
