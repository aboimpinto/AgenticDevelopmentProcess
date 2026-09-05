import { describe, expect, it } from "vitest";
import {
  assertCoherentReplanOperation,
  assertReplanReviewScope,
  assertReplanScope,
  replanOperationRecordKeys,
} from "../src/review-governance/replan-operation-policy.js";

const scope = {
  projectId: "project-alpha", featureId: "work-item-alpha", phaseNumber: 2,
  reviewGateId: "review-gate", defectClass: "contract-drift", aggregateId: "aggregate-alpha",
};

describe("replan operation policy", () => {
  it.each([
    ["OBSERVATION", ["observation"]],
    ["THRESHOLD_MANIFESTATION", ["observation", "transition"]],
    ["SCOPE_EXPANSION_ACCEPTED", ["decision", "observation", "transition"]],
    ["PLAN_REQUEST", ["request", "transition"]],
    ["DISPATCH_FAILED", ["dispatch"]],
    ["REVIEW_ASSESSMENT", ["assessment", "transition"]],
  ])("defines the closed %s record set", (kind, keys) => {
    expect(replanOperationRecordKeys(kind)).toEqual(keys);
  });

  it("returns the shared scope and aggregate for a coherent operation", () => {
    const result = assertCoherentReplanOperation("THRESHOLD_MANIFESTATION", {
      observation: { ...scope, observationEventId: "observation-alpha" },
      transition: { ...scope, triggerRecordId: "observation-alpha" },
    });
    expect(result).toEqual({
      scope: { projectId: scope.projectId, featureId: scope.featureId, phaseNumber: 2,
        reviewGateId: scope.reviewGateId, defectClass: scope.defectClass },
      aggregateId: scope.aggregateId,
    });
  });

  it("rejects cross-record scope, aggregate, and trigger disagreement", () => {
    expect(() => assertCoherentReplanOperation("THRESHOLD_MANIFESTATION", {
      observation: { ...scope, observationEventId: "observation-alpha" },
      transition: { ...scope, featureId: "work-item-beta", triggerRecordId: "observation-alpha" },
    })).toThrow(/^INVALID_INPUT$/);
    expect(() => assertCoherentReplanOperation("THRESHOLD_MANIFESTATION", {
      observation: { ...scope, observationEventId: "observation-alpha" },
      transition: { ...scope, triggerRecordId: "observation-other" },
    })).toThrow(/^INVALID_INPUT$/);
  });

  it("validates review and defect-class scope members generically", () => {
    expect(assertReplanReviewScope(scope)).toMatchObject({ projectId: scope.projectId, phaseNumber: 2 });
    expect(assertReplanScope(scope)).toMatchObject({ defectClass: "contract-drift" });
    expect(() => assertReplanScope({ ...scope, defectClass: "Wrong Class" })).toThrow(/^INVALID_INPUT$/);
    expect(() => replanOperationRecordKeys("UNKNOWN")).toThrow(/^INVALID_INPUT$/);
  });
});
