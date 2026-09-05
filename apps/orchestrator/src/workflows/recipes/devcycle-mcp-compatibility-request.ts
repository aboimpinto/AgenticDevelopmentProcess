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
  readonly prefixedToolName: string;
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
    prefixedToolName: `${serverName.replace(/-/g, "_")}_${mapping.toolName}`,
    serverName,
    toolName: mapping.toolName,
  });
}

/** Gives one selected Pi model the legacy client contract without importing native Hepha recipe prose. */
export function renderDevCycleMcpCompatibilityPrompt(request: DevCycleMcpCompatibilityRequest): string {
  return [
    "You are Hepha's DevCycle MCP compatibility worker.",
    "The MCP response supplies the recipe; Hepha retains lifecycle invariants. Do not use a native Hepha skill as the recipe source.",
    "Use the available `mcp` gateway tool; do not call the endpoint with bash, curl, or handwritten JSON-RPC.",
    "",
    "Call this MCP recipe tool exactly once:",
    "```js",
    `mcp({ server: ${JSON.stringify(request.serverName)}, tool: ${JSON.stringify(request.prefixedToolName)}, args: ${JSON.stringify(request.arguments)} })`,
    "```",
    "If metadata is not live, connect to the server first with:",
    "```js",
    `mcp({ connect: ${JSON.stringify(request.serverName)} })`,
    "```",
    "A successful recipe response has structuredContent where status == \"pending_execution\", action == \"execute_procedure\", execution_owner == \"client_llm\", and retry_same_tool == false.",
    "When that contract is present, execute the returned instructions locally with your normal Pi file, shell, Git, and editing tools. Do not retry the same recipe call.",
    "Apply the following Hepha lifecycle invariants to the returned recipe. They define lifecycle safety and decision ownership; they do not replace the provider's implementation procedure:",
    ...renderOperationInvariants(request),
    "Preserve the selected workflow mode across every explicit handoff returned by the procedure. Autonomous mode continues end-to-end; single_phase mode accepts one phase and then stops. Call each handed-off DevCycle MCP command once in this same Pi session and model.",
    "Treat structuredContent.status == \"error\", a JSON-RPC error, an unavailable tool, or a missing execution contract as a blocking failure. Report the exact boundary and do not substitute native Hepha instructions.",
    "Preserve unrelated user changes and do not start development servers.",
    "",
    `Compatibility operation: ${request.operation}`,
    `MCP server: ${request.serverName}`,
    `MCP tool: ${request.toolName}`,
  ].join("\n");
}

function renderOperationInvariants(request: DevCycleMcpCompatibilityRequest): readonly string[] {
  if (request.operation === "refineFeature") {
    return [
      "- Deep-Dive owns clarification. Refine Feature consumes resolved target decisions and MUST NOT create human-sign-off, owner-attestation, CODEOWNER-approval, manual-acceptance, or user-choice tasks.",
      "- If the target FeatureDescription still has an unresolved implementation decision, stop before publishing any refinement artifacts and route that target decision through Deep-Dive.",
      "- Validation markers or uncertainty in linked or contextual documents must not block the target feature; they are read-only context unless the target explicitly imports the unresolved decision.",
      "- Classify every test/qualification item statically as AUTOMATABLE or MANUAL_TEST_REQUIRED. A user-provided physical device, qualified GUI/session, hardware capability, external ceremony, or inherently manual interaction is MANUAL_TEST_REQUIRED.",
      "- Do not turn MANUAL_TEST_REQUIRED work into a blocking executable implementation gate. Create it only for a real human-operable surface, never for internal models, architecture, static catalogues, schema/digest/startup validation, immutable structures, unit tests, or source properties. Record its task as SKIPPED with reason 'This test cannot be automated and the user needs to test it manually.' and create ManualTestObligations.json (hepha-manual-test-obligations/v1) with a concrete application/interface as the first action, exact preconditions, account/test-data requirements, specific actions, observable expected result, and evidence requirements. Placeholder workflows are invalid.",
      "- Every generated non-skipped task must be executable by an autonomous developer from the target specification, completed Deep-Dive decisions, repository evidence, and automated quality gates.",
      "- Refine Feature is a documentation-only planning action. Do not execute package-manager, compiler, build, test, lint, audit, dependency-search, or version-probe commands, including cargo, rustc, npm, pnpm, yarn, dotnet, or their equivalents.",
      "- Discover technology and configured commands statically from manifests, lockfiles, workflows, source, and project documentation. Use documentation research when static evidence is insufficient; record commands in the plan without running them.",
      "- Do not modify product implementation repositories during refinement. Mutations are limited to the target MemoryBank refinement artifacts and lifecycle projections required by the recipe.",
    ];
  }
  if (request.operation === "startImplementing" || request.operation === "continueImplementing" || request.operation === "completeFeature") {
    const manualTestRules = request.operation === "startImplementing"
      ? [
        "- Validate that every refinement task marked SKIPPED because it requires manual testing has a matching valid ManualTestObligations.json entry. Preserve that skip and obligation; never reactivate it as PENDING.",
        "- Reject start readiness when a manual skip has no traced Manual TestPack obligation, or when a manual obligation has no corresponding skipped task.",
      ]
      : request.operation === "continueImplementing"
        ? [
          "- If the current selected task cannot be automated in the available execution model and requires user-provided physical/manual testing, do not mark it COMPLETED and do not edit machine-owned task/phase state. Return one single-line HEPHA_MANUAL_TEST_DEFERRAL_V1 receipt per required manual case; Hepha owns SKIPPED persistence and ManualTestObligations.json projection.",
          "- Use exact reason 'This test cannot be automated and the user needs to test it manually.' Include stable id, title, phaseNumber, orchestrator/contract taskId, preconditions, steps, expectedResult, and evidenceRequirements. An actually executed failing command is never eligible for deferral.",
        ]
        : [];
    return [
      "- In autonomous and single_phase execution, NEVER stop to request human sign-off, owner attestation, CODEOWNER approval, product/technical choice, review approval, phase acceptance, or permission to continue.",
      "- The implementation worker has delegated decision authority. Apply the target specification, completed Deep-Dive decisions, canonical planning artifact, repository evidence, project conventions, security-first defaults, and downstream compatibility constraints.",
      "- If a phase contains a human approval/sign-off/attestation task, treat it as a refinement defect: replace it with an evidence-based automated decision or validation, record the rationale, add tests where applicable, and continue.",
      "- If an ambiguity escaped Deep-Dive, choose and document the safest deterministic interpretation consistent with authoritative evidence; do not create a new human gate.",
      "- Preserve all configured quality gates. Invoke automated code review and phase acceptance within this same workflow instead of asking the user to run them.",
      "- Apply stack-specific execution constraints only when refinement activated them with evidence. Read and obey inherited execution constraints from FeatureTasks.md and the active phase file; do not invent technology-specific constraints for projects where refinement omitted them.",
      "- A configured gate that prints any warning is RED even when its process exits 0. Never classify a warning as pre-existing, benign, accepted, or green; repair it and rerun the complete configured gate before phase acceptance.",
      "- Implementation completion and release readiness are independent outcomes. Determine phase and feature implementation completion only from in-scope tasks and configured executable gates owned by the current feature.",
      "- Out-of-scope or external release dependencies are non-blocking implementation findings. Record them in the final report, FeatureDescription, linked epic, and Lessons Learned with recommended follow-up EPIC/FEAT work; do not stop implementation or leave the phase incomplete.",
      "- Only an in-scope task or configured executable gate may block implementation acceptance. Do not convert missing future test suites, external repository hardening, physical qualification, organizational release evidence, or other work owned outside the current feature into implementation failure authority.",
      "- Never relabel an executed failing in-scope command as external. Repair and rerun it. When all in-scope tasks and configured executable gates are green, complete implementation and report release-readiness findings separately.",
      ...manualTestRules,
    ];
  }
  return [
    "- Do not introduce a future human-sign-off, owner-attestation, CODEOWNER-approval, or manual-acceptance dependency; unresolved target decisions belong in Deep-Dive.",
  ];
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`DEV_CYCLE_MCP_REQUEST_INVALID: ${field}`);
  return normalized;
}
