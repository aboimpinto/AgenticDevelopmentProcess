import type { AgentActionId, FeatureWorkflowCommand } from "@hepha/shared";
import type { FeatureRecipeOperation } from "./feature-recipe-source-policy.js";

interface CompatibilityMapping {
  readonly agentAction: AgentActionId;
  readonly command: FeatureWorkflowCommand;
  readonly toolName: string;
  readonly supportsWorkflowMode: boolean;
}

const compatibilityMappings: Readonly<Record<FeatureRecipeOperation, CompatibilityMapping>> = Object.freeze({
  designFeature: Object.freeze({
    agentAction: "design-feature", command: "design-feature", toolName: "design-feature", supportsWorkflowMode: false,
  }),
  refineFeature: Object.freeze({
    agentAction: "refine-feature", command: "refine-feature", toolName: "refine-feature", supportsWorkflowMode: false,
  }),
  startImplementing: Object.freeze({
    agentAction: "start-feature", command: "start-implementing", toolName: "start-feature", supportsWorkflowMode: true,
  }),
  continueImplementing: Object.freeze({
    agentAction: "continue-implementing", command: "continue-implementing", toolName: "continue-implementation", supportsWorkflowMode: true,
  }),
  completeFeature: Object.freeze({
    agentAction: "complete-feature", command: "complete-feature", toolName: "complete-feature", supportsWorkflowMode: true,
  }),
});

export interface DevCycleMcpCompatibilityRequest {
  readonly agentAction: AgentActionId;
  readonly arguments: Readonly<Record<string, string>>;
  readonly command: FeatureWorkflowCommand;
  readonly operation: FeatureRecipeOperation;
  readonly serverName: "devcycle-mcp";
  readonly toolName: string;
}

/** Creates the immutable MCP invocation requested by one user-facing feature action. */
export function createDevCycleMcpCompatibilityRequest(input: {
  readonly autonomous: boolean;
  readonly featureId: string;
  readonly featurePath: string;
  readonly operation: FeatureRecipeOperation;
}): DevCycleMcpCompatibilityRequest {
  const featureId = requireText(input.featureId, "featureId");
  const featurePath = requireText(input.featurePath, "featurePath");
  const mapping = compatibilityMappings[input.operation];
  if (!mapping) throw new Error("DEV_CYCLE_MCP_OPERATION_INVALID");
  const args: Record<string, string> = { feature_id: featureId, feature_path: featurePath };
  if (mapping.supportsWorkflowMode) {
    args.workflow_mode = input.autonomous ? "autonomous" : "single_phase";
  }
  const serverName = "devcycle-mcp" as const;
  return Object.freeze({
    agentAction: mapping.agentAction,
    arguments: Object.freeze(args),
    command: mapping.command,
    operation: input.operation,
    serverName,
    toolName: mapping.toolName,
  });
}

/** Gives one selected Pi model the legacy client contract without importing native Hepha recipe prose. */
export function renderDevCycleMcpCompatibilityPrompt(
  request: DevCycleMcpCompatibilityRequest,
  refinementDiagnostics: readonly string[] = [],
): string {
  return [
    "You are Hepha's DevCycle MCP compatibility worker.",
    "The MCP response is the sole source of workflow procedure and gate instructions. Do not substitute native Hepha recipes.",
    "Use the available `mcp` gateway tool; do not call the endpoint with bash, curl, or handwritten JSON-RPC.",
    "",
    "Call this MCP recipe tool exactly once:",
    "```js",
    `mcp({ server: ${JSON.stringify(request.serverName)}, tool: ${JSON.stringify(request.toolName)}, args: ${JSON.stringify(request.arguments)} })`,
    "```",
    "The server selector scopes the original MCP tool name. Preserve both names exactly; do not add a gateway display prefix or normalize punctuation for a model/provider.",
    "Use the same server-scoped original-name lookup for explicit DevCycle command handoffs.",
    "If metadata is not live, connect to the server first with:",
    "```js",
    `mcp({ connect: ${JSON.stringify(request.serverName)} })`,
    "```",
    "A successful recipe response has structuredContent where status == \"pending_execution\", action == \"execute_procedure\", execution_owner == \"client_llm\", and retry_same_tool == false.",
    "When that contract is present, execute the returned instructions locally with your normal Pi file, shell, Git, and editing tools. Do not retry the same recipe call.",
    ...(refinementDiagnostics.length > 0
      ? [
          "",
          "HEPHA found these deterministic validation errors in the existing refinement artifacts. Repair every item before reporting COMPLETED:",
          ...refinementDiagnostics.slice(0, 50).map((diagnostic) => `- ${diagnostic}`),
        ]
      : []),
    "Preserve the selected workflow mode across every explicit handoff returned by the procedure. Autonomous mode continues end-to-end; single_phase mode accepts one phase and then stops. Call each handed-off DevCycle MCP command once in this same Pi session and model.",
    "Treat structuredContent.status == \"error\", a JSON-RPC error, an unavailable tool, or a missing execution contract as a blocking failure. Report the exact boundary and do not substitute native Hepha instructions.",
    "Preserve unrelated user changes and do not start development servers.",
    "",
    `Compatibility operation: ${request.operation}`,
    `MCP server: ${request.serverName}`,
    `MCP tool: ${request.toolName}`,
  ].join("\n");
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`DEV_CYCLE_MCP_REQUEST_INVALID: ${field}`);
  return normalized;
}
