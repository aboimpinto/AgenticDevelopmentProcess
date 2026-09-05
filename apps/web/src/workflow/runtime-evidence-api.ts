import {
  isRuntimeFeatureEvidenceV1,
  isRuntimePhaseExecutionEvidencePageV1,
  type RuntimeFeatureEvidenceV1,
  type RuntimePhaseExecutionEvidencePageV1,
} from "@hepha/shared";

export interface RuntimeEvidenceApi {
  fetchFeature(projectId: string, cardKey: string): Promise<RuntimeFeatureEvidenceV1>;
  fetchPhase(
    projectId: string,
    cardKey: string,
    phaseExecutionContractId: string,
    cursor: string | null,
    limit?: number,
  ): Promise<RuntimePhaseExecutionEvidencePageV1>;
}

/** Fetches runtime evidence and rejects the complete response before React sees malformed nested data. */
export function createRuntimeEvidenceApi(): RuntimeEvidenceApi {
  return {
    async fetchFeature(projectId, cardKey) {
      const value = await readJson(`/api/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(cardKey)}/runtime-evidence`);
      if (!isRuntimeFeatureEvidenceV1(value)) throw new Error("Runtime evidence response is invalid.");
      return value;
    },
    async fetchPhase(projectId, cardKey, phaseExecutionContractId, cursor, limit = 32) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== null) query.set("cursor", cursor);
      const value = await readJson(`/api/projects/${encodeURIComponent(projectId)}/features/${encodeURIComponent(cardKey)}/runtime-evidence/phases/${encodeURIComponent(phaseExecutionContractId)}/executions?${query}`);
      if (!isRuntimePhaseExecutionEvidencePageV1(value)) throw new Error("Runtime evidence response is invalid.");
      return value;
    },
  };
}

async function readJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  const contentType = response.headers.get("content-type") ?? "";
  const value: unknown = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error("Runtime evidence is unavailable.");
  return value;
}
