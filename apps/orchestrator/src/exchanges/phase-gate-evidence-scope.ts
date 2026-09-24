import { isDeepStrictEqual } from "node:util";
import type { PhaseGateRecord } from "./phase-gates.js";

/** Evidence belongs to an execution reference and its acceptance scope. */
export function samePhaseGateEvidenceScope(
  previous: PhaseGateRecord,
  current: PhaseGateRecord,
  check?: PhaseGateRecord["checks"][number],
): boolean {
  const scope = (record: PhaseGateRecord) => {
    const mappings = record.coverage.criteria
      .filter(criterion => !check || criterion.checkIds.includes(check.id))
      .map(criterion => ({ ...criterion, checkIds: check ? [check.id] : [...criterion.checkIds].sort(), testPaths: [...criterion.testPaths].sort() }))
      .sort((a, b) => a.criterionId.localeCompare(b.criterionId));
    const ids = new Set(mappings.map(mapping => mapping.criterionId));
    // Unmapped checks have no narrower declaration of what they verify.
    const criteria = record.criteria.filter(criterion => !check || !ids.size || ids.has(criterion.id))
      .map(criterion => ({ ...criterion })).sort((a, b) => a.id.localeCompare(b.id));
    const applicability = !check ? record.flags.needCodeReview
      : check.gate === "tests" || check.gate === "gherkin_e2e" ? record.flags.needTestCoverage : null;
    // Review scope is the declared acceptance criteria, not the test runner
    // allocation. Adding a test for unchanged criteria does not revise review.
    return { criteria, mappings: check ? mappings : undefined, applicability };
  };
  return isDeepStrictEqual(scope(previous), scope(current));
}
