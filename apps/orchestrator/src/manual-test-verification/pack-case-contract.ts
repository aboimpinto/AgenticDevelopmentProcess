import { validateManualTestCase, type ManualTestCase } from "../manual-test-verification-policy.js";

/** The same executable case contract is used at model, storage and result boundaries. */
export function parseManualTestCases(value: unknown): ManualTestCase[] {
  if (!Array.isArray(value)) throw new Error("Manual test cases must be an array.");
  const ids = new Set<string>();
  return value.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid manual test case.");
    const test = raw as Record<string, unknown>;
    for (const key of ["id", "title", "purpose", "role", "application", "setupData", "expectedResult"]) {
      if (typeof test[key] !== "string" || !(test[key] as string).trim()) throw new Error(`Manual test ${key} is required.`);
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(test.id as string) || ids.has(test.id as string)) {
      throw new Error("Manual test IDs must be unique, stable identifiers.");
    }
    ids.add(test.id as string);
    for (const key of ["sourceIds", "preconditions", "steps"]) {
      if (!Array.isArray(test[key]) || !(test[key] as unknown[]).every((entry) => typeof entry === "string" && entry.trim())) {
        throw new Error(`Manual test ${key} must contain strings.`);
      }
    }
    if (!(test.sourceIds as string[]).length) throw new Error("Manual test source IDs are required.");
    const candidate = test as unknown as ManualTestCase;
    const errors = validateManualTestCase(candidate);
    if (errors.length) throw new Error(errors.join(" "));
    return candidate;
  });
}
