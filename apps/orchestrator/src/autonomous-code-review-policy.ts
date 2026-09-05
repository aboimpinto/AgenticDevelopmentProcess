/**
 * Evidence-based autonomous code-review routing.
 *
 * Refinement declares gate intent in durable Quality Gate Evidence, but an
 * observed production-source change is authoritative: it always requires an
 * autonomous code review. Documentation, FEAT, and test-only changes do not.
 */
export interface AutonomousCodeReviewPolicyInput {
  readonly changedFiles: readonly string[];
}

const productionExtension = /\.(?:[cm]?[jt]sx?|rs|cs|java|kt|kts|go|py|rb|php|swift|scala|fs|fsx|vb)$/i;
// TestProjects is a common .NET convention; keep test fixtures, harnesses,
// specs, and integration/e2e projects out of production-code review too.
const testPath = /(?:^|\/)(?:(?:test|tests|testprojects|test-projects|__tests__|spec|specs|e2e|integration)|[^/]*\.(?:test|tests|spec|specs))(?:\/|$)|(?:\.|-)(?:test|tests|spec|specs|e2e)\.[^.]+$/i;
const nonProductionPath = /^(?:MemoryBank|docs|logs)\//i;

export function isProductionSourcePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return productionExtension.test(normalized) && !testPath.test(normalized) && !nonProductionPath.test(normalized);
}

export function requiresAutonomousCodeReview(input: AutonomousCodeReviewPolicyInput): boolean {
  return selectProductionCodeReviewFiles(input.changedFiles).length > 0;
}

/**
 * The code-review target is deliberately narrower than the phase's full
 * evidence set: documentation, test, generated, and unrelated dirty files
 * never become review targets. Tests remain verification evidence, not a
 * reason to dispatch a production-code review.
 */
export function selectProductionCodeReviewFiles(changedFiles: readonly string[]): string[] {
  return [...new Set(changedFiles.map((path) => path.replace(/\\/g, "/").replace(/^\.\//, "")))]
    .filter(isProductionSourcePath)
    .sort((left, right) => left.localeCompare(right));
}
