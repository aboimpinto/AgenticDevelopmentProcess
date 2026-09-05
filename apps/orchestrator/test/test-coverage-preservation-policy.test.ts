import { describe, expect, it } from "vitest";
import { evaluateTestCoveragePreservation } from "../src/test-coverage-preservation-policy.js";

describe("test coverage preservation policy", () => {
  const before = [{
    path: "test/workflow.spec.ts",
    caseNames: ["creates a finding", "records a passing result"],
    assertionCount: 4,
  }];

  it("allows repaired fixtures when all prior cases and assertions remain", () => {
    expect(evaluateTestCoveragePreservation(before, [{
      ...before[0],
      caseNames: [...before[0].caseNames, "handles a retry"],
      assertionCount: 5,
    }])).toEqual({ kind: "allowed" });
  });

  it("denies deleted or renamed cases", () => {
    expect(evaluateTestCoveragePreservation(before, [{
      path: before[0].path,
      caseNames: ["renders a document"],
      assertionCount: 4,
    }])).toEqual({
      kind: "denied",
      violations: [{
        path: before[0].path,
        missingCaseNames: ["creates a finding", "records a passing result"],
        assertionDeficit: 0,
      }],
    });
  });

  it("denies assertion stripping even when test titles remain", () => {
    expect(evaluateTestCoveragePreservation(before, [{ ...before[0], assertionCount: 1 }])).toEqual({
      kind: "denied",
      violations: [{ path: before[0].path, missingCaseNames: [], assertionDeficit: 3 }],
    });
  });
});
