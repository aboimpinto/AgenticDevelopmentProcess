/** Test model adapter: express existing synthetic evidence decisions using the
 * production exchange requested by the caller, keeping retrieval/routing replies intact. */
export function acceptedAssessmentReply(prompt: string, raw: string): string {
  const line = prompt.split("\n").find(l => l.startsWith("Evidence: "));
  if (!line || !prompt.includes('"feature.acceptance.assessment"')) return raw;
  const model = JSON.parse(line.slice(10));
  if (!model.acceptedScope) return raw;
  let result: any;
  try { result = JSON.parse(raw); } catch { return raw; }
  if (result.schemaVersion || !Array.isArray(result.links) || !Array.isArray(result.unresolved)) return raw;
  if (result.unresolved.some((u: any) => u.execution && (!Array.isArray(u.execution.testPaths) || !u.execution.testPaths.length))) return raw;
  const ids = [...new Set([...result.links, ...result.unresolved].map((c: any) => c.sourceId))];
  return JSON.stringify({ schemaVersion: "hepha-exchange/v1", kind: "feature.acceptance.assessment", payload: {
    baselineId: model.acceptedScope.id,
    criteria: ids.map(sourceId => {
      const unresolved = result.unresolved.find((u: any) => u.sourceId === sourceId);
      const missing = unresolved?.diagnosis?.kind === "implementation_missing";
      const clause = model.acceptedScope.criteria.find((c: any) => c.sourceId === sourceId)?.text;
      return { sourceId, status: missing ? "unmet" : unresolved ? "evidence_pending" : "satisfied",
        contributions: result.links.filter((l: any) => l.sourceId === sourceId).map(({ sourceId: _id, ...link }: any) => link),
        ...(missing ? { gap: { obligation: clause, expected: clause, observed: unresolved.diagnosis.explanation, references: unresolved.diagnosis.references, nextAction: unresolved.diagnosis.nextAction } } : unresolved ? { evidenceNeed: { kind: unresolved.diagnosis?.kind && unresolved.diagnosis.kind !== "implementation_missing" ? unresolved.diagnosis.kind : /no valid executed report|execution|run.*test/i.test(unresolved.reason) ? "execution_missing" : "investigation_required", reason: unresolved.reason, references: unresolved.diagnosis?.references ?? unresolved.execution?.testPaths ?? ["FeatureDescription.md"], nextAction: unresolved.diagnosis?.nextAction ?? "Inspect existing verification evidence" } } : {}) };
    }), improvements: result.improvements ?? [],
  } });
}
