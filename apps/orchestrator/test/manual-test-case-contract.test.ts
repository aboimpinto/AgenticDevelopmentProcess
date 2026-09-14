import { describe, expect, it } from "vitest";
import { parseManualTestCases } from "../src/manual-test-verification/pack-case-contract.js";

const sample = { id: "MT-DEVICE-LINUX-A", title: "Save", purpose: "Check Save", sourceIds: ["AC-UI-SAVE"], role: "Operator",
  application: "Example console", setupData: "No account or data is required", preconditions: ["Example console is running"],
  steps: ["Open the Example console", "Select Save"], expectedResult: "Save confirmation is visible." };
describe("shared executable manual-case contract", () => {
  it.each(["MT-001", "MT-DEVICE-LINUX-A", "browser.keyboard_2"])("accepts stable ID %s without a feature naming convention", (id) => {
    expect(parseManualTestCases([{ ...sample, id }])[0]?.id).toBe(id);
  });
  it.each([null, {}, [sample, sample], [{ ...sample, steps: [] }], [{ ...sample, sourceIds: [] }], [{ ...sample, id: "../outside" }], [{ ...sample, application: "TBD" }]])("rejects invalid case definitions", (value) => {
    expect(() => parseManualTestCases(value)).toThrow();
  });
});
