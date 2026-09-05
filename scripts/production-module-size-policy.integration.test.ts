import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findProductionModuleSizeViolations,
  isProductionModuleFile,
  measureProductionModules,
} from "./production-module-size-policy.js";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptsRoot, "..");
const specification = readFileSync(
  resolve(scriptsRoot, "generic-production-module-size-policy.feature"),
  "utf8",
);

describe("generic production module size policy Gherkin integration", () => {
  it("binds every scenario to the repository-wide production measurement", () => {
    expect(specification.match(/^  Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+/i);

    const measurements = measureProductionModules(workspaceRoot);
    expect(measurements.some(({ path }) => path.startsWith("apps/"))).toBe(true);
    expect(measurements.some(({ path }) => path.startsWith("packages/"))).toBe(true);
    expect(measurements.every(({ path }) => isProductionModuleFile(path))).toBe(true);
    expect(findProductionModuleSizeViolations(measurements)).toEqual([]);
    expect(findProductionModuleSizeViolations([{ path: "owner.ts", lines: 1_001 }]))
      .toEqual([{ path: "owner.ts", lines: 1_001 }]);
  });
});
