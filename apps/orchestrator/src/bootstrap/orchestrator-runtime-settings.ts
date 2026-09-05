import { resolve } from "node:path";
import { readRawSessionLogCleanupConfig } from "../raw-session-log-cleanup.js";
import {
  createOrchestratorRuntimeEnvironment,
  inferOrchestratorWorkspaceRoot,
  readWindowsUserEnvironmentValue,
  resolveWorkflowSkillPaths,
} from "../runtime/orchestrator-runtime-configuration.js";
import { validatePortableModelAuthorityInventory } from "../portable-model-authority-inventory.js";
import { createPiProcessEnvironment, ensureCargoShimDirectory } from "../runtime/pi/pi-process-environment.js";
import { resolveMcpCompatibilityRuntimeConfiguration } from "../runtime/mcp-compatibility-runtime-configuration.js";
import { createFeatureRecipeSourcePolicy } from "../workflows/recipes/feature-recipe-source-policy.js";
import {
  readOptionalPositiveIntegerEnvironment,
  readPositiveIntegerEnvironment,
} from "../runtime/positive-integer-environment-policy.js";

/** Resolves process-wide paths, limits, skills, and Pi environment factories once. */
export function createOrchestratorRuntimeSettings(input: {
  cwd: string;
  environment?: NodeJS.ProcessEnv;
}) {
  const inferredWorkspaceRoot = inferOrchestratorWorkspaceRoot(input.cwd);
  const runtimeEnv = createOrchestratorRuntimeEnvironment({
    baseEnvironment: input.environment,
    workspacePath: inferredWorkspaceRoot,
  });
  const fingerprintAbsoluteSafetyCap = readPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_FINGERPRINT_ABSOLUTE_SAFETY_CAP,
    15,
  );
  const featureRecipeSourcePolicy = createFeatureRecipeSourcePolicy(runtimeEnv);
  const mcpCompatibility = resolveMcpCompatibilityRuntimeConfiguration({
    enabled: featureRecipeSourcePolicy.usesDevCycleMcp,
    environment: runtimeEnv,
    workspaceRoot: inferredWorkspaceRoot,
  });
  const workspaceRoot = runtimeEnv.HEPHA_AGENT_CWD ?? inferredWorkspaceRoot;
  const localStateDir = resolve(inferredWorkspaceRoot, ".hepha");
  const workflowSkillPaths = resolveWorkflowSkillPaths({
    environment: runtimeEnv,
    workspaceRoot: inferredWorkspaceRoot,
  });
  const inventoryPath = resolve(inferredWorkspaceRoot, "docs/architecture/project-hepha-asset-inventory.json");
  const inventory = validatePortableModelAuthorityInventory({
    configuredSkillPaths: [
      { expectedAgentAction: "complete-feature", path: workflowSkillPaths.completeFeature },
      { expectedAgentAction: "continue-implementing", path: workflowSkillPaths.continueImplementation },
      { expectedAgentAction: "deep-dive", path: workflowSkillPaths.deepDive },
      { expectedAgentAction: "design-feature", path: workflowSkillPaths.designFeature },
      { expectedAgentAction: "refine-feature", path: workflowSkillPaths.refineFeature },
      { expectedAgentAction: null, path: workflowSkillPaths.serializedBuildCommands },
      { expectedAgentAction: "start-feature", path: workflowSkillPaths.startFeature },
    ].filter((entry): entry is { expectedAgentAction: typeof entry.expectedAgentAction; path: string } =>
      entry.path !== null),
    inventoryPath,
    workspaceRoot: inferredWorkspaceRoot,
  });
  if (inventory.diagnostics.length > 0) {
    const diagnostic = inventory.diagnostics.find(({ code, field }) =>
      code === "PORTABLE_ASSET_INVALID" && field === "(inventory)") ?? inventory.diagnostics[0];
    throw new Error(`${diagnostic.code}: Portable model-authority inventory is invalid.`);
  }
  const implementationSkillPaths = [
    workflowSkillPaths.serializedBuildCommands,
    workflowSkillPaths.deepDive,
    workflowSkillPaths.designFeature,
    workflowSkillPaths.refineFeature,
    workflowSkillPaths.startFeature,
    workflowSkillPaths.continueImplementation,
    workflowSkillPaths.completeFeature,
  ].filter((skillPath): skillPath is string => Boolean(skillPath));
  const piEnvironmentInput = {
    localStateDirectory: localStateDir,
    readUserEnvironmentValue: readWindowsUserEnvironmentValue,
    runtimeEnv,
    workspaceRoot: inferredWorkspaceRoot,
  };
  const explicitImplementationMaximum = readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_IMPLEMENTATION_MAX_RUNTIME_MS,
  );
  const legacyImplementationMaximum = readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_IMPLEMENTATION_TIMEOUT_MS,
  );
  const implementationStallTimeout = readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_IMPLEMENTATION_STALL_TIMEOUT_MS,
  ) ?? readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_IMPLEMENTATION_IDLE_TIMEOUT_MS,
  ) ?? 1800000;
  const explicitRefineMaximum = readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_REFINE_FEATURE_MAX_RUNTIME_MS,
  );
  const legacyRefineMaximum = readOptionalPositiveIntegerEnvironment(
    runtimeEnv.HEPHA_PI_REFINE_FEATURE_TIMEOUT_MS,
  );

  return {
    completeFeatureSkillPath: workflowSkillPaths.completeFeature,
    continueImplementationSkillPath: workflowSkillPaths.continueImplementation,
    createPiProcessEnv: () => createPiProcessEnvironment(piEnvironmentInput),
    deepDiveDocumentUpdateTimeoutMs: Number.parseInt(
      runtimeEnv.HEPHA_PI_DEEP_DIVE_DOCUMENT_UPDATE_TIMEOUT_MS ?? "900000",
      10,
    ),
    deepDiveModelRewriteMaxChars: Number.parseInt(
      runtimeEnv.HEPHA_DEEP_DIVE_MODEL_REWRITE_MAX_CHARS ?? "12000",
      10,
    ),
    deepDiveSkillPath: workflowSkillPaths.deepDive,
    designFeatureSkillPath: workflowSkillPaths.designFeature,
    ensurePiCargoShimDirectory: () => ensureCargoShimDirectory(piEnvironmentInput),
    fingerprintAbsoluteSafetyCap,
    implementationIdleTimeoutMs: implementationStallTimeout,
    implementationRunTimeoutMs: explicitImplementationMaximum ?? legacyImplementationMaximum,
    implementationSkillPaths,
    featureRecipeSourcePolicy,
    mcpCompatibility,
    inferredWorkspaceRoot,
    localStateDir,
    maxFixerResponseRepairAttempts: Math.min(
      readPositiveIntegerEnvironment(runtimeEnv.HEPHA_FIXER_RESPONSE_REPAIR_ATTEMPTS, 3),
      fingerprintAbsoluteSafetyCap,
    ),
    port: Number.parseInt(runtimeEnv.HEPHA_ORCHESTRATOR_PORT ?? "4317", 10),
    rawSessionLogCleanupConfig: readRawSessionLogCleanupConfig(runtimeEnv),
    refineFeatureStallTimeoutMs: readPositiveIntegerEnvironment(
      runtimeEnv.HEPHA_PI_REFINE_FEATURE_STALL_TIMEOUT_MS,
      900000,
    ),
    refineFeatureMaxRuntimeMs: explicitRefineMaximum ?? legacyRefineMaximum,
    refineFeatureMaxRuntimeSource: explicitRefineMaximum !== null
      ? "explicit" as const
      : legacyRefineMaximum !== null ? "legacy" as const : "disabled" as const,
    refineFeatureSkillPath: workflowSkillPaths.refineFeature,
    runTimeoutMs: Number.parseInt(runtimeEnv.HEPHA_PI_RUN_TIMEOUT_MS ?? "180000", 10),
    runtimeEnv,
    serializedBuildCommandsSkillPath: workflowSkillPaths.serializedBuildCommands,
    sessionDir: runtimeEnv.HEPHA_PI_SESSION_DIR ?? resolve(workspaceRoot, "logs", "pi-sessions"),
    startFeatureSkillPath: workflowSkillPaths.startFeature,
    workspaceRoot,
  };
}
