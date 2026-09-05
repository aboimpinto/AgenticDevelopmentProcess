import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  analyzeProductionModuleReachability,
  isReachabilityProductionFile,
} from "./production-module-reachability-policy.js";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptsRoot, "..");
const specification = readFileSync(
  resolve(scriptsRoot, "generic-production-module-reachability-policy.feature"),
  "utf8",
);

describe("generic production module reachability policy Gherkin integration", () => {
  it("binds every product-blind scenario to the real repository graph", () => {
    expect(specification.match(/^  Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|Task \d+/i);

    const analysis = analyzeProductionModuleReachability(workspaceRoot);
    expect(analysis.modules.every(isReachabilityProductionFile)).toBe(true);
    expect(analysis.roots.some((path) => path.startsWith("apps/"))).toBe(true);
    expect(analysis.roots.some((path) => path.startsWith("packages/"))).toBe(true);
    expect(analysis.roots.some((path) => path.startsWith("scripts/"))).toBe(true);
    expect(analysis.unreachable).toEqual([]);
  }, 30_000);
});
