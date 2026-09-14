import type { CatalogModelRecord, HandoffPlanV1 } from "@hepha/shared";
import type { PiCatalogProcess } from "../../model-catalog/catalog-ports.js";

/** Resolve one local SDK snapshot per refresh, not the display catalogue cache.
 * Provider + model identity must agree with the already approved route. */
export async function liveReadinessModelLimits(plan: HandoffPlanV1,
  lookup: (connection: CatalogModelRecord["identity"]["connectionId"], model: string) => CatalogModelRecord | undefined,
  provider: ((connection: CatalogModelRecord["identity"]["connectionId"]) => string | null) | undefined,
  process: PiCatalogProcess) {
  const fail = () => new Error("HEPHA_MODEL_CONTEXT_UNKNOWN: cannot resolve current local Pi limits for every approved route. Check Pi model configuration; no request sent and no cached capacity substituted.");
  let rows: Record<string, unknown>[];
  try {
    const result = await process.listModels({ timeoutMs: 10_000, maxStdoutBytes: 1_048_576 });
    if (result.kind !== "success") throw fail();
    const payload = JSON.parse(result.stdout);
    if (!Array.isArray(payload?.models)) throw fail();
    rows = payload.models.filter((row: unknown) => row && typeof row === "object");
  } catch { throw fail(); }
  const records = new Map<string, CatalogModelRecord>();
  const key = (connection: string, model: string) => JSON.stringify([connection, model]);
  for (const { route } of plan.steps) {
    const cached = lookup(route.connectionId, route.modelId);
    const providerId = provider?.(route.connectionId);
    const matches = rows.filter(row => row.providerId === providerId && row.modelId === route.modelId);
    if (!cached || !providerId || matches.length !== 1) throw fail();
    const row = matches[0]!;
    const capabilities = row.capabilities as Record<string, unknown> | undefined;
    if (!Number.isSafeInteger(row.contextWindowTokens) || Number(row.contextWindowTokens) <= 0
      || !Number.isSafeInteger(row.maxOutputTokens) || Number(row.maxOutputTokens) <= 0
      || capabilities?.reasoning !== true) throw fail();
    records.set(key(route.connectionId, route.modelId), { ...cached,
      contextWindowTokens: Number(row.contextWindowTokens), maxOutputTokens: Number(row.maxOutputTokens),
      capabilities: { ...cached.capabilities, reasoning: true } });
  }
  return (connection: CatalogModelRecord["identity"]["connectionId"], model: string) => records.get(key(connection, model));
}
