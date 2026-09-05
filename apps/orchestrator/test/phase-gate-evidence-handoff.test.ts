import { describe, expect, it } from "vitest";
import {
  applyPhaseGateEvidenceHandoff,
  assertPhaseGateEvidencePassed,
  parsePhaseGateEvidenceHandoff,
} from "../src/phase-gate-evidence-handoff.js";

const phaseDocument = `## Quality Gate Evidence

| Gate | Decision | Evidence / Justification |
| --- | --- | --- |
| Changed files | missing | Awaiting worker. |
| Tests | missing | Awaiting worker. |
| Gherkin/Playwright E2E | missing | Awaiting worker. |
| Code review | not applicable | No production change. |
`;

describe("phase gate evidence handoff", () => {
  it("requires explicit results for every worker-owned gate", () => {
    const output = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/a.ts\`; \`test/a.test.ts\` |
| Tests | passed | \`pnpm test a\` passed: 2/2. |
| Gherkin/Playwright E2E | not_applicable | No browser behavior changed. |
`;

    expect(parsePhaseGateEvidenceHandoff(output)).toEqual({
      changedFiles: "`src/a.ts`; `test/a.test.ts`",
      tests: { result: "passed", evidence: "`pnpm test a` passed: 2/2." },
      gherkinE2e: { result: "not_applicable", evidence: "No browser behavior changed." },
    });
  });

  it.each([
    ["failed:timeout", "failed with detail"],
    ["passes", "misspelling"],
    ["sucess", "misspelling"],
    ["completed", "synonym"],
  ])("rejects %s (%s) as an invalid Tests result", (resultLabel) => {
    const output = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/a.ts\` |
| Tests | ${resultLabel} | 2/2 passed. |
| Gherkin/Playwright E2E | not_applicable | No browser behavior changed. |
`;

    const error = "Phase worker did not return a complete ## Hepha Gate Evidence Handoff with explicit Changed files=recorded and Tests/Gherkin results (passed, failed, or not_applicable).";
    expect(() => parsePhaseGateEvidenceHandoff(output)).toThrow(error);
  });

  it.each([
    ["notApplicable", "camelCase"],
    ["N/A", "common abbreviation"],
    ["na", "lowercase abbreviation"],
    ["no", "single word"],
    ["none", "common synonym"],
    ["skip", "common synonym"],
    ["irrelevant", "common synonym"],
  ])("rejects %s (%s) as an invalid Gherkin/Playwright E2E result", (resultLabel) => {
    const output = `## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/a.ts\` |
| Tests | passed | 2/2 passed. |
| Gherkin/Playwright E2E | ${resultLabel} | No browser behavior changed. |
`;

    const error = "Phase worker did not return a complete ## Hepha Gate Evidence Handoff with explicit Changed files=recorded and Tests/Gherkin results (passed, failed, or not_applicable).";
    expect(() => parsePhaseGateEvidenceHandoff(output)).toThrow(error);
  });

  it("normalizes 'not applicable' (space) to 'not_applicable' (underscore) for Tests", () => {
    const result = parsePhaseGateEvidenceHandoff(`## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/a.ts\` |
| Tests | not applicable | no browser change |
| Gherkin/Playwright E2E | not_applicable | no browser change |
`);
    expect(result.tests.result).toBe("not_applicable");
  });

  it("normalizes 'not applicable' (space) to 'not_applicable' (underscore) for Gherkin/Playwright E2E", () => {
    const result = parsePhaseGateEvidenceHandoff(`## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`src/a.ts\` |
| Tests | passed | 2/2 passed. |
| Gherkin/Playwright E2E | not applicable | No browser behavior changed. |
`);
    expect(result.gherkinE2e.result).toBe("not_applicable");
  });

  it("rejects the legacy evidence-only table instead of guessing success", () => {
    const legacy = `## Hepha Gate Evidence Handoff
| Gate | Evidence |
| --- | --- |
| Changed files | \`src/a.ts\` |
| Tests | \`pnpm test\` failed |
`;
    expect(() => parsePhaseGateEvidenceHandoff(legacy)).toThrow("explicit Changed files=recorded");
  });

  it("persists failed test and Playwright results as missing and denies task completion", () => {
    const failed = parsePhaseGateEvidenceHandoff(`## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | No source change; failure evidence recorded. |
| Tests | failed | \`pnpm test\` timed out. |
| Gherkin/Playwright E2E | failed | \`pnpm test:e2e\` failed. |
`);

    const result = applyPhaseGateEvidenceHandoff(phaseDocument, failed);
    expect(result).toContain("| Tests | missing | `pnpm test` timed out. |");
    expect(result).toContain("| Gherkin/Playwright E2E | missing | `pnpm test:e2e` failed. |");
    expect(() => assertPhaseGateEvidencePassed(failed)).toThrow(
      "failed quality gates: Tests, Gherkin/Playwright E2E",
    );
  });

  it("maps explicit passed and not-applicable results without path-name inference", () => {
    const handoff = parsePhaseGateEvidenceHandoff(`## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`docs/plan.md\` |
| Tests | passed | Structural validation passed. |
| Gherkin/Playwright E2E | not_applicable | Planning changes no runtime browser behavior. |
`);

    const result = applyPhaseGateEvidenceHandoff(phaseDocument, handoff);
    expect(result).toContain("| Tests | satisfied | Structural validation passed. |");
    expect(result).toContain("| Gherkin/Playwright E2E | not applicable | Planning changes no runtime browser behavior. |");
    expect(() => assertPhaseGateEvidencePassed(handoff)).not.toThrow();
  });

  it("accumulates changed-file evidence across successful tasks", () => {
    const earlier = phaseDocument.replace(
      "| Changed files | missing | Awaiting worker. |",
      "| Changed files | satisfied | `src/production.ts` |",
    );
    const handoff = parsePhaseGateEvidenceHandoff(`## Hepha Gate Evidence Handoff

| Gate | Result | Evidence |
| --- | --- | --- |
| Changed files | recorded | \`docs/handoff.md\` |
| Tests | passed | Documentation checks passed. |
| Gherkin/Playwright E2E | not_applicable | No browser behavior changed. |
`);

    expect(applyPhaseGateEvidenceHandoff(earlier, handoff)).toContain(
      "| Changed files | satisfied | `src/production.ts`; `docs/handoff.md` |",
    );
  });
});
