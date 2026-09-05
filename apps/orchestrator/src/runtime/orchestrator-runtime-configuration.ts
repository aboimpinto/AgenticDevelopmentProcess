import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { resolvePathInput } from "../path-input.js";
import { validatePortableAssetSource } from "../portable-asset-contract.js";

export interface WorkflowSkillPaths {
  completeFeature: string | null;
  continueImplementation: string | null;
  deepDive: string | null;
  designFeature: string | null;
  refineFeature: string | null;
  serializedBuildCommands: string | null;
  startFeature: string | null;
}

/** Resolves the monorepo root when launched from the orchestrator package. */
export function inferOrchestratorWorkspaceRoot(cwd: string) {
  return basename(cwd) === "orchestrator" && basename(dirname(cwd)) === "apps"
    ? resolve(cwd, "..", "..")
    : cwd;
}

/** Builds process-local orchestrator configuration without mutating process.env. */
export function createOrchestratorRuntimeEnvironment(input: {
  baseEnvironment?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  readUserEnvironmentValue?: (key: string) => string | null;
  workspacePath: string;
}) {
  const env: NodeJS.ProcessEnv = { ...(input.baseEnvironment ?? process.env) };
  for (const [key, value] of Object.entries(readDotEnv(resolve(input.workspacePath, ".env")))) {
    if (!env[key] && value) env[key] = value;
  }
  const platform = input.platform ?? process.platform;
  const readUserValue = input.readUserEnvironmentValue
    ?? ((key: string) => readWindowsUserEnvironmentValue(key, platform));
  for (const key of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "HEPHA_PI_COMMAND"]) {
    if (!env[key]) {
      const userValue = readUserValue(key);
      if (userValue) env[key] = userValue;
    }
  }
  env.HEPHA_DATABASE_PATH ??= resolve(input.workspacePath, ".hepha", "hepha.sqlite");
  env.PI_SKIP_VERSION_CHECK ??= "1";
  env.PI_TELEMETRY ??= "0";
  return env;
}

/** Resolves every optional workflow skill from configuration or its canonical package path. */
export function resolveWorkflowSkillPaths(input: {
  environment: NodeJS.ProcessEnv;
  pathExists?: (path: string) => boolean;
  readSkillSource?: (path: string) => string;
  workspaceRoot: string;
}): WorkflowSkillPaths {
  const pathExists = input.pathExists ?? existsSync;
  const resolveSkill = (configurationKey: string, segments: string[]) => {
    const configuredPath = input.environment[configurationKey]?.trim();
    const candidatePath = configuredPath
      ? resolvePathInput(configuredPath, { basePath: input.workspaceRoot })
      : resolve(input.workspaceRoot, ...segments);
    return pathExists(candidatePath) ? candidatePath : null;
  };
  const implementationSkills = [
    "pi-packages",
    "pi-skill-hepha-continue-implementation",
    "skills",
  ];
  const paths: WorkflowSkillPaths = {
    completeFeature: resolveSkill("HEPHA_COMPLETE_FEATURE_SKILL_PATH", [...implementationSkills, "complete-feature"]),
    continueImplementation: resolveSkill("HEPHA_CONTINUE_IMPLEMENTATION_SKILL_PATH", [...implementationSkills, "continue-implementation"]),
    deepDive: resolveSkill("HEPHA_DEEP_DIVE_SKILL_PATH", [...implementationSkills, "deep-dive"]),
    designFeature: resolveSkill("HEPHA_DESIGN_FEATURE_SKILL_PATH", [...implementationSkills, "design-feature"]),
    refineFeature: resolveSkill("HEPHA_REFINE_FEATURE_SKILL_PATH", [...implementationSkills, "refine-feature"]),
    serializedBuildCommands: resolveSkill("HEPHA_SERIALIZED_BUILD_COMMANDS_SKILL_PATH", [
      "pi-packages",
      "pi-skill-serialized-build-commands",
      "skills",
      "serialized-build-commands",
    ]),
    startFeature: resolveSkill("HEPHA_START_FEATURE_SKILL_PATH", [...implementationSkills, "start-feature"]),
  };
  const expectedActions = {
    completeFeature: "complete-feature",
    continueImplementation: "continue-implementing",
    deepDive: "deep-dive",
    designFeature: "design-feature",
    refineFeature: "refine-feature",
    serializedBuildCommands: null,
    startFeature: "start-feature",
  } as const;
  for (const [key, path] of Object.entries(paths) as [keyof WorkflowSkillPaths, string | null][]) {
    if (!path) continue;
    const source = input.readSkillSource
      ? input.readSkillSource(path)
      : readFileSync(path.endsWith("SKILL.md") ? path : resolve(path, "SKILL.md"), "utf8");
    const expectedAgentAction = expectedActions[key];
    const diagnostics = validatePortableAssetSource(source, {
      expectedAgentAction,
      kind: "skill",
      requireDirectHostAuthority: expectedAgentAction !== null,
    }).diagnostics;
    if (diagnostics.length > 0) {
      throw new Error(`${diagnostics[0].code}: Configured workflow skill is not portable.`);
    }
  }
  return paths;
}

function readDotEnv(path: string) {
  const values: Record<string, string> = {};
  if (!existsSync(path)) return values;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const separatorIndex = trimmedLine.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmedLine.slice(0, separatorIndex).trim();
    values[key] = unquoteEnvValue(trimmedLine.slice(separatorIndex + 1).trim());
  }
  return values;
}

export function readWindowsUserEnvironmentValue(
  key: string,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform !== "win32") return null;
  try {
    const output = execFileSync("reg", ["query", "HKCU\\Environment", "/v", key], {
      encoding: "utf8",
      windowsHide: true,
    });
    const line = output.split(/\r?\n/).map((candidate) => candidate.trim())
      .find((candidate) => candidate.startsWith(key));
    if (!line) return null;
    const parts = line.split(/\s{2,}/);
    return parts.length >= 3 ? parts.slice(2).join("  ").trim() : null;
  } catch {
    return null;
  }
}

function unquoteEnvValue(value: string) {
  return (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
    ? value.slice(1, -1)
    : value;
}
