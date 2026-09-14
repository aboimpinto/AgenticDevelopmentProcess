import { expect, it } from "vitest";
import type { AcceptanceCoverageLink } from "@hepha/shared";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";
import { coverageLinkBinding, coverageLinkKey } from "../src/manual-test-verification/coverage-link-bindings.js";

const manual: AcceptanceCoverageLink = { sourceId: "AC-01", evidenceId: "MT-01", kind: "manual", stepNumbers: [1], explanation: "The operator inspects the result." };
function model(result = "pass", source = "Original criterion", step = "Inspect result") {
  return { manifestEntries: [{ sourceId: "AC-01", criterionPreview: source }], automatedEvidence: [], tests: [{ id: "MT-01", steps: [step] }],
    recoveryContext: { manualResults: [{ testId: "MT-01", result, reviewId: "review", resultId: "result" }] },
  } as unknown as ManualTestDeliveryModel;
}
it("binds manual confirmation to the exact criterion, steps and current human outcome", () => {
  const binding = coverageLinkBinding(manual, model());
  expect(binding).toMatch(/^[a-f\d]{64}$/);
  expect(coverageLinkBinding(manual, model())).toBe(binding);
  for (const changed of [model("fail"), model("pass", "Changed criterion"), model("pass", "Original criterion", "Different step")]) {
    expect(coverageLinkBinding(manual, changed)).not.toBe(binding);
  }
  expect(coverageLinkBinding({ ...manual, stepNumbers: [2] }, model())).not.toBe(binding);
  expect(coverageLinkKey(manual)).not.toBe(coverageLinkKey({ ...manual, stepNumbers: [2] }));
});
it("cannot bind a missing criterion or evidence and does not depend on unrelated evidence order", () => {
  expect(coverageLinkBinding({ ...manual, sourceId: "missing" }, model())).toBe("");
  expect(coverageLinkBinding({ ...manual, evidenceId: "missing" }, model())).toBe("");
  const current = model();
  const extra = { ...current, tests: [{ id: "unrelated", steps: [] }, ...current.tests] } as ManualTestDeliveryModel;
  expect(coverageLinkBinding(manual, extra)).toBe(coverageLinkBinding(manual, current));
});
