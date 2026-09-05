import type { PreviewFeatCandidate } from "@hepha/shared";

// ──────────────────────────────────────────────
// FEAT-011: Phase 2 — Dependency topological ordering
// ──────────────────────────────────────────────

export interface OrderedCandidatesResult {
  ordered: PreviewFeatCandidate[];
  warnings: string[];
  blocked: boolean;
}

export function orderByDependencies(candidates: PreviewFeatCandidate[]): OrderedCandidatesResult {
  const warnings: string[] = [];
  const candidateMap = new Map<string, PreviewFeatCandidate>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const c of candidates) {
    candidateMap.set(c.plannedFeatureId, c);
    inDegree.set(c.plannedFeatureId, 0);
    adjacency.set(c.plannedFeatureId, []);
  }

  for (const c of candidates) {
    for (const depId of c.dependencyIds) {
      if (candidateMap.has(depId)) {
        adjacency.get(depId)!.push(c.plannedFeatureId);
        inDegree.set(c.plannedFeatureId, (inDegree.get(c.plannedFeatureId) ?? 0) + 1);
      } else {
        warnings.push(
          `Unresolved dependency: ${c.plannedFeatureId} depends on ${depId}, which is not in the candidate list.`,
        );
      }
    }
  }

  const queue: string[] = [];

  for (const [featId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(featId);
    }
  }

  queue.sort(
    (a, b) => (candidateMap.get(a)?.sourceOrder ?? 0) - (candidateMap.get(b)?.sourceOrder ?? 0),
  );

  const sorted: string[] = [];
  let visitedCount = 0;

  while (queue.length > 0) {
    queue.sort(
      (a, b) => (candidateMap.get(a)?.sourceOrder ?? 0) - (candidateMap.get(b)?.sourceOrder ?? 0),
    );

    const current = queue.shift()!;
    sorted.push(current);
    visitedCount++;

    for (const neighbor of adjacency.get(current) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (visitedCount < candidates.length) {
    warnings.push("Dependency cycle detected. Some candidates cannot be fully ordered.");

    for (const c of candidates) {
      if (!sorted.includes(c.plannedFeatureId)) {
        sorted.push(c.plannedFeatureId);
      }
    }

    return {
      ordered: sorted.map((id) => candidateMap.get(id)!).filter(Boolean),
      warnings,
      blocked: true,
    };
  }

  return {
    ordered: sorted.map((id) => candidateMap.get(id)!).filter(Boolean),
    warnings,
    blocked: false,
  };
}
