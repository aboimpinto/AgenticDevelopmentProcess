import type { CatalogScannerResult, PiCatalogProcess } from "./catalog-ports.js";

const PI_SCAN_TIMEOUT_MS = 10_000;
const PI_MAX_STDOUT_BYTES = 1_048_576;

/** Converts bounded Pi catalog process output into the normalizer's input shape. */
export class PiModelCatalogScanner {
  constructor(private readonly process: PiCatalogProcess) {}

  async scan(input: { readonly providerIds?: readonly string[] } = {}): Promise<CatalogScannerResult> {
    const result = await this.process.listModels({
      timeoutMs: PI_SCAN_TIMEOUT_MS,
      maxStdoutBytes: PI_MAX_STDOUT_BYTES,
    });
    if (result.kind === "timeout") return failure("timeout");
    if (result.kind === "spawn_failed" || result.kind === "non_zero") return failure("process_failed");

    try {
      const payload: unknown = JSON.parse(result.stdout);
      return { kind: "success", payload };
    } catch {
      const payload = parsePiModelTable(result.stdout, input.providerIds);
      return payload ? { kind: "success", payload } : failure("malformed_response");
    }
  }
}

function parsePiModelTable(
  stdout: string,
  providerIds: readonly string[] | undefined,
): { readonly models: readonly Record<string, unknown>[] } | null {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  const header = lines[0]!.trim().split(/\s+/);
  if (header.join("\u0000") !== ["provider", "model", "context", "max-out", "thinking", "images"].join("\u0000")) {
    return null;
  }
  const allowedProviders = providerIds && providerIds.length > 0 ? new Set(providerIds) : null;
  const models: Record<string, unknown>[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length !== 6) return null;
    const [providerId, modelId, context, maxOutput, thinking, images] = columns as [string, string, string, string, string, string];
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(providerId) || !/^[^\s]{1,512}$/.test(modelId)) return null;
    if (thinking !== "yes" && thinking !== "no") return null;
    if (images !== "yes" && images !== "no") return null;
    const contextWindowTokens = parseTokenCount(context);
    const maxOutputTokens = parseTokenCount(maxOutput);
    if (contextWindowTokens === null || maxOutputTokens === null) return null;
    if (allowedProviders && !allowedProviders.has(providerId)) continue;
    models.push({
      modelId,
      contextWindowTokens,
      maxOutputTokens,
      inputModalities: images === "yes" ? ["image", "text"] : ["text"],
      capabilities: {
        api: true,
        reasoning: thinking === "yes",
        tools: true,
      },
    });
  }
  return models.length > 0 ? { models } : null;
}

function parseTokenCount(value: string): number | null {
  const match = /^([1-9][0-9]*)([KM])?$/.exec(value);
  if (!match) return null;
  const multiplier = match[2] === "M" ? 1_000_000 : match[2] === "K" ? 1_000 : 1;
  const result = Number(match[1]) * multiplier;
  return Number.isSafeInteger(result) && result <= 10_000_000 ? result : null;
}

function failure(outcome: "timeout" | "process_failed" | "malformed_response"): CatalogScannerResult {
  return { kind: "failure", outcome, httpStatusCode: null };
}
