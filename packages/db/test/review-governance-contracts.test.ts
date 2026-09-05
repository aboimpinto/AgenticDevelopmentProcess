import { describe, expect, it } from "vitest";
import {
  ALLOWED_ARTIFACT_KINDS,
  ALLOWED_CYCLE_STATES,
  ALLOWED_GATE_STATES,
  type ReviewIngestInput,
  type StoredReplanGovernanceAggregate,
} from "../src/review-governance/contracts.js";

describe("review governance persistence contracts", () => {
  it("defines the complete supported artifact family without duplicates", () => {
    expect(ALLOWED_ARTIFACT_KINDS).toEqual([
      "review_manifest",
      "remediation_response",
      "verification_receipt",
      "replan_plan",
      "debt_observation",
    ]);
    expect(new Set(ALLOWED_ARTIFACT_KINDS).size).toBe(ALLOWED_ARTIFACT_KINDS.length);
  });

  it("defines non-duplicated remediation and gate state vocabularies", () => {
    expect(ALLOWED_CYCLE_STATES).toContain("NO_REMEDIATION_REQUIRED");
    expect(ALLOWED_CYCLE_STATES).toContain("REPLAN_REQUIRED");
    expect(new Set(ALLOWED_CYCLE_STATES).size).toBe(ALLOWED_CYCLE_STATES.length);
    expect(ALLOWED_GATE_STATES).toEqual(["APPROVED", "REJECTED", "BLOCKED", "PENDING"]);
  });

  it("keeps ingress and stored aggregate shapes available to consumers", () => {
    const acceptsIngress = (_input: ReviewIngestInput): void => undefined;
    const acceptsAggregate = (_aggregate: StoredReplanGovernanceAggregate): void => undefined;
    expect(acceptsIngress).toBeTypeOf("function");
    expect(acceptsAggregate).toBeTypeOf("function");
  });
});
