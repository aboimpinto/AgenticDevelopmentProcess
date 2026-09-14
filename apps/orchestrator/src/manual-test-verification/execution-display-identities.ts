/**
 * Display names describe assertions; they are not globally unique test IDs.
 * Keep familiar labels when unambiguous, and address repeated labels by native
 * identity or by their record position within this report. An occurrence is
 * execution evidence, not a new acceptance criterion or proof of coverage.
 */
export function executionDisplayIdentities(labels: readonly string[], nativeIds?: readonly string[]): string[] {
  const totals = new Map<string, number>();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  return labels.map((label, index) => totals.get(label) === 1 ? label
    : `${label} [${nativeIds ? `native execution ${JSON.stringify(nativeIds[index])}` : `report-local execution ${index + 1}`}]`);
}
