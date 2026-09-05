import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  inspectRefactorLedger,
  REQUIRED_REFACTOR_SLICE_EVIDENCE,
} from "./refactor-ledger-policy.js";

const scriptsRoot = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptsRoot, "..");
const specification = readFileSync(resolve(scriptsRoot, "generic-refactor-ledger-policy.feature"), "utf8");

describe("generic refactor ledger policy Gherkin integration", () => {
  it("binds every product-blind scenario to the complete real refactor history", () => {
    expect(specification.match(/^  Scenario:/gm)).toHaveLength(3);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|Task \d+/i);

    const { issues, slices } = inspectRefactorLedger(workspaceRoot);
    expect(slices[0]?.number).toBe(1);
    expect(slices.at(-1)?.number).toBeGreaterThan(1);
    expect(slices.every(({ evidence }) => REQUIRED_REFACTOR_SLICE_EVIDENCE.every((field) => evidence.has(field))))
      .toBe(true);
    expect(issues).toEqual([]);
  });
});
