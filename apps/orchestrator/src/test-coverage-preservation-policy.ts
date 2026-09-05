export interface TestArtifactCoverage {
  readonly path: string;
  readonly caseNames: readonly string[];
  readonly assertionCount: number;
}

export interface TestCoverageViolation {
  readonly path: string;
  readonly missingCaseNames: readonly string[];
  readonly assertionDeficit: number;
}

export type TestCoveragePreservationDecision =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{ kind: "denied"; violations: readonly TestCoverageViolation[] }>;

/**
 * Existing executable scenarios are an invariant during repair. A worker may
 * add coverage or repair fixtures/assertions, but it may not obtain a green
 * gate by deleting, renaming, merging, or assertion-stripping prior tests.
 */
export function evaluateTestCoveragePreservation(
  before: readonly TestArtifactCoverage[],
  after: readonly TestArtifactCoverage[],
): TestCoveragePreservationDecision {
  const afterByPath = new Map(after.map((artifact) => [artifact.path, artifact]));
  const violations: TestCoverageViolation[] = [];

  for (const prior of before) {
    const current = afterByPath.get(prior.path);
    const currentNames = new Set(current?.caseNames ?? []);
    const missingCaseNames = prior.caseNames.filter((name) => !currentNames.has(name));
    const assertionDeficit = Math.max(0, prior.assertionCount - (current?.assertionCount ?? 0));
    if (!current || missingCaseNames.length > 0 || assertionDeficit > 0) {
      violations.push({ path: prior.path, missingCaseNames, assertionDeficit });
    }
  }

  return violations.length === 0 ? { kind: "allowed" } : { kind: "denied", violations };
}
