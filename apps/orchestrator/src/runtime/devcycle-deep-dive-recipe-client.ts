import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { DeepDiveMcpPrompt, DeepDiveMcpRequest } from "../application/deep-dive/deep-dive-mcp-procedure.js";

const outputs = { opening: "questions_json", follow_up: "questions_json", clarify: "clarification_text", apply_answers: "target_markdown" } as const;
const invalid = () => new Error("MCP_DEEP_DIVE_CONTRACT_INVALID: the configured DevCycle server must supply the requested hosted interview stage (v1).");

/** DevCycle's stateless JSON-RPC HTTP recipe endpoint. Only instructions and a
 * target locator go over this boundary; interview answers stay in the Pi input.
 * There is no native-procedure fallback and no credential-bearing URL in errors. */
export function createDevCycleDeepDiveRecipeClient(configPath: string, request: typeof fetch = fetch,
  isActive?: (runId: string) => Promise<boolean>): DeepDiveMcpPrompt {
  return async (input: DeepDiveMcpRequest) => {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const server = config?.mcpServers?.["devcycle-mcp"];
    let endpoint: URL;
    try { endpoint = new URL(server?.url); } catch { throw new Error("MCP_DEEP_DIVE_HTTP_CONFIG_REQUIRED"); }
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) throw new Error("MCP_DEEP_DIVE_HTTP_CONFIG_REQUIRED");
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(server.headers ?? {})) {
      if (typeof value !== "string") throw new Error("MCP_DEEP_DIVE_HEADERS_INVALID");
      headers[name] = value;
    }
    const id = randomUUID();
    let response: Response;
    try {
      response = await request(endpoint, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: {
          name: "deep-dive", arguments: { file_path: input.targetPath, response_mode: "host_stage", stage: input.stage },
        } }),
      });
    } catch { throw new Error("MCP_DEEP_DIVE_RECIPE_UNAVAILABLE: the recipe request failed or timed out."); }
    if (!response.ok) throw new Error(`MCP_DEEP_DIVE_RECIPE_UNAVAILABLE: HTTP ${response.status}.`);
    const raw = await response.text();
    if (Buffer.byteLength(raw) > 2_000_000) throw invalid();
    let wire: any;
    try { wire = JSON.parse(raw); } catch { throw invalid(); }
    const recipe = wire?.result?.structuredContent;
    const contract = recipe?.deep_dive_host_contract;
    if (wire?.jsonrpc !== "2.0" || wire.id !== id || wire.error || wire.result?.isError
      || recipe?.status !== "pending_execution" || recipe.action !== "execute_procedure"
      || recipe.execution_owner !== "client_llm" || recipe.retry_same_tool !== false
      || contract?.version !== "devcycle-deep-dive-host/v1" || contract.stage !== input.stage
      || contract.target_file !== input.targetPath || contract.output !== outputs[input.stage]
      || !Array.isArray(contract.mutation_scope) || contract.mutation_scope.length !== 0
      || typeof recipe.instructions !== "string" || !recipe.instructions.trim()) throw invalid();
    if (input.workflowRunId && isActive && !await isActive(input.workflowRunId)) {
      throw new Error("MCP_DEEP_DIVE_SESSION_INACTIVE: interview stopped while fetching its recipe.");
    }
    return `${recipe.instructions}\n\nHost interview data (JSON):\n${JSON.stringify(input.context)}`;
  };
}
