import { expect, it } from "vitest";
import { validateCoverageLinks } from "../src/manual-test-verification/acceptance-coverage-reconciliation.js";
import { proposeCoverageReconciliation } from "../src/manual-test-verification/coverage-reconciliation-prompt.js";
import type { ManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";

const sourceId = "AC-MIXED";
const manual = { sourceId, kind: "manual", evidenceId: "operator", stepNumbers: [1], explanation: "Recorded operator check proves physical accessibility, not browser automation." };
const automated = { sourceId, kind: "automated", evidenceId: "browser", explanation: "Executed browser report proves the automated boundary, not physical accessibility." };
const model = { manifestEntries: [{ sourceId, criterionPreview: "Browser Playwright execution and physical accessibility qualification together verify delivery." }],
  tests: [{ id: "operator", steps: ["Verify physical accessibility"] }],
  automatedEvidence: [{ id: "browser", status: "executed-passed", command: "project verify", sourcePath: "browser.json", detail: "2 tests passed; revision: abcdef012345" }],
} as unknown as ManualTestDeliveryModel;

it("MCOV-01 validates complete mixed evidence collectively, independent of link order", async () => {
  for (const links of [[manual, automated], [automated, manual]]) {
    expect(validateCoverageLinks(links, model)).toEqual(links);
    const result = await proposeCoverageReconciliation(model, async () => JSON.stringify({ links, unresolved: [] }));
    expect(result.proposal.links).toEqual(links);
    expect(result.unresolved).toEqual([]);
  }
});

it("MCOV-02 retains manual and automated partial proof and the exact remaining diagnosis", async () => {
  const unresolved = [{ sourceId, reason: "One browser state still lacks execution evidence.",
    diagnosis: { kind: "environment_blocked", explanation: "The controlled browser fixture is unavailable.", references: ["verification.md:8"], nextAction: "Inspect documented fixture setup; preserve existing passes." },
    execution: { command: "project verify", testPaths: ["tests/existing.feature"], prerequisite: "Provide the documented controlled fixture." } }];
  const result = await proposeCoverageReconciliation(model, async () => JSON.stringify({ links: [manual, automated], unresolved }));
  expect(result.partialLinks).toEqual([manual, automated]);
  expect(result.unresolved).toEqual(unresolved);
  expect(result.proposal.links).toEqual([]);
});

it("MCOV-03 preserves a precise blocker and its action when a different contribution is invalid", async () => {
  const diagnosis = { kind: "evidence_missing", explanation: "Locate the archived browser report before requesting execution.", references: ["verification.md:9"], nextAction: "Restore the existing report." };
  const result = await proposeCoverageReconciliation(model, async () => JSON.stringify({ links: [automated, { ...manual, stepNumbers: [999] }],
    unresolved: [{ sourceId, reason: "Archived report linkage is missing.", diagnosis }] }));
  expect(result.unresolved[0]?.reason).toContain("Archived report linkage is missing.");
  expect(result.unresolved[0]?.diagnosis).toEqual(diagnosis);
  expect(result.partialLinks).toEqual([automated]);
  expect(result.proposal.links).toEqual([]);
});

it("MCOV-04 never lets manual-only or unexecuted automation settle an automated requirement", async () => {
  expect(() => validateCoverageLinks([manual], model)).toThrow("automated verification");
  expect(() => validateCoverageLinks([manual, { ...automated, sourceId: "AC-OTHER" }], {
    ...model, manifestEntries: [...model.manifestEntries, { sourceId: "AC-OTHER" }],
  } as never)).toThrow("automated verification");
  for (const status of ["not-executed", "executed-failed", "zero-tests-discovered"]) {
    const result = await proposeCoverageReconciliation({ ...model, automatedEvidence: [{ ...model.automatedEvidence[0]!, status }] } as never,
      async () => JSON.stringify({ links: [manual, automated], unresolved: [] }));
    expect(result.proposal.links).toEqual([]);
    expect(result.unresolved).toHaveLength(1);
  }
});
