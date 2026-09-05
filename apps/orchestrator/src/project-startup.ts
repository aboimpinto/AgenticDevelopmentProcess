import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ensurePostgresDatabaseExists } from "@hepha/db";

export interface StartupProject {
  id: string;
  name: string;
  rootPath: string;
}

export interface ProjectStartupPlan {
  databaseEnvKey: string;
  migrationScript: "prisma:migrate:deploy";
  projectKind: "prisma-postgres";
  serverPath: string;
}

export interface PrepareProjectStartupOptions {
  env: NodeJS.ProcessEnv;
  readUserEnvironmentValue?: (key: string) => string | null;
}

export function getProjectStartupPlan(project: StartupProject): ProjectStartupPlan | null {
  const serverPath = resolve(project.rootPath, "server");
  const packageJsonPath = resolve(serverPath, "package.json");
  const prismaConfigPath = resolve(serverPath, "prisma.config.ts");
  const prismaSchemaPath = resolve(serverPath, "prisma", "schema.prisma");

  if (!existsSync(packageJsonPath) || !existsSync(prismaConfigPath) || !existsSync(prismaSchemaPath)) {
    return null;
  }

  const prismaConfig = readFileSync(prismaConfigPath, "utf8");
  const prismaSchema = readFileSync(prismaSchemaPath, "utf8");
  const databaseEnvKey = extractPrismaDatabaseEnvKey(prismaConfig);

  if (!databaseEnvKey || !/provider\s*=\s*["']postgresql["']/.test(prismaSchema)) {
    return null;
  }

  const packageJson = readJsonFile(packageJsonPath);
  const scripts = packageJson?.scripts;

  if (!scripts || typeof scripts !== "object") {
    return null;
  }

  if ((scripts as Record<string, unknown>)["prisma:migrate:deploy"] !== "prisma migrate deploy --schema ./prisma/schema.prisma") {
    return null;
  }

  return {
    databaseEnvKey,
    migrationScript: "prisma:migrate:deploy",
    projectKind: "prisma-postgres",
    serverPath,
  };
}

export function extractPrismaDatabaseEnvKey(prismaConfig: string) {
  const matches = [
    prismaConfig.match(/\benv\(\s*["']([A-Z][A-Z0-9_]*_DATABASE_URL)["']\s*\)/),
    prismaConfig.match(/\bprocess\.env\[["']([A-Z][A-Z0-9_]*_DATABASE_URL)["']\]/),
    prismaConfig.match(/\bprocess\.env\.([A-Z][A-Z0-9_]*_DATABASE_URL)\b/),
  ];

  return matches.find((match) => match)?.[1] ?? null;
}

export function isProjectStartupAuthorized(projectId: string, env: NodeJS.ProcessEnv) {
  return (env.HEPHA_PROJECT_STARTUP_ALLOWLIST ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(projectId);
}

export async function prepareProjectOnOrchestratorStartup(
  project: StartupProject,
  options: PrepareProjectStartupOptions,
) {
  if (!isProjectStartupAuthorized(project.id, options.env)) {
    return;
  }

  const plan = getProjectStartupPlan(project);

  if (!plan) {
    return;
  }

  const projectEnv = createProjectStartupEnv(plan.serverPath, options, [plan.databaseEnvKey]);
  const databaseUrl = projectEnv[plan.databaseEnvKey];

  if (!databaseUrl) {
    console.warn(
      `[startup:${project.name}] ${plan.databaseEnvKey} is not configured; skipping PostgreSQL database creation and migrations.`,
    );
    return;
  }

  console.log(
    `[startup:${project.name}] Preparing the project PostgreSQL database from ${plan.databaseEnvKey}.`,
  );

  try {
    const ensureResult = await ensurePostgresDatabaseExists(databaseUrl);

    console.log(
      `[startup:${project.name}] PostgreSQL database ${ensureResult.created ? "created" : "exists"}: ${ensureResult.databaseName}`,
    );
  } catch (error) {
    console.warn(
      `[startup:${project.name}] Could not create/check the PostgreSQL database; attempting migrations against the configured database URL.`,
      error instanceof Error ? error.message : error,
    );
  }

  execFileSync(getPnpmCommand(), [plan.migrationScript], {
    cwd: plan.serverPath,
    encoding: "utf8",
    env: projectEnv,
    windowsHide: true,
  });

  console.log(`[startup:${project.name}] Prisma migrations applied.`);
}

export function createProjectStartupEnv(
  serverPath: string,
  options: PrepareProjectStartupOptions,
  databaseEnvKeys: readonly string[] = [],
) {
  const projectEnv = {
    ...options.env,
    ...readDotEnv(resolve(serverPath, ".env")),
  };

  for (const key of databaseEnvKeys) {
    if (!projectEnv[key]) {
      const userValue = options.readUserEnvironmentValue?.(key);

      if (userValue) {
        projectEnv[key] = userValue;
      }
    }
  }

  return projectEnv;
}

function readJsonFile(path: string) {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readDotEnv(path: string) {
  const values: Record<string, string> = {};

  if (!existsSync(path)) {
    return values;
  }

  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    values[key] = unquoteEnvValue(rawValue);
  }

  return values;
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function getPnpmCommand() {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}
