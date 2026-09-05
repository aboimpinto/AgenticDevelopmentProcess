import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ReviewEvidenceRepository } from "../src/review-governance/evidence-repository.js";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-review-evidence-repository.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/review-governance-store.ts"), "utf8");

describe("generic review evidence repository Gherkin integration", () => {
  it("specifies four identity-blind evidence query behaviors", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("exposes every bounded production read", () => {
    for (const method of ["listFindingsByRun", "listObservationsByRun", "listCyclesByScope",
      "listRemediationItemsByRun", "listVerificationReceiptsByRun", "getObservationContext"] as const) {
      expect(ReviewEvidenceRepository.prototype[method]).toBeTypeOf("function");
    }
  });

  it("keeps evidence query SQL outside the facade", () => {
    expect(facade).toContain("this.evidenceRepository.listFindingsByRun(reviewRunId)");
    expect(facade).toContain("this.evidenceRepository.getObservationContext(rawObservationId)");
    expect(facade).not.toContain("from hepha_review_findings\n         where review_run_id");
    expect(facade).not.toContain("from hepha_review_verification_receipts where review_run_id");
  });
});
