import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createProjectStartupEnv,
  extractPrismaDatabaseEnvKey,
  getProjectStartupPlan,
  isProjectStartupAuthorized,
} from "../src/project-startup.js";

let tempRoots: string[] = [];

afterEach(() => {
  for (const tempRoot of tempRoots) {
    rmSync(tempRoot, { force: true, recursive: true });
  }

  tempRoots = [];
});

describe("getProjectStartupPlan", () => {
  it("detects a generic PostgreSQL Prisma migration contract", () => {
    const rootPath = createProjectRoot({
      prismaConfig: 'url: process.env["APP_DATABASE_URL"]',
      scripts: {
        "prisma:migrate:deploy": "prisma migrate deploy --schema ./prisma/schema.prisma",
      },
    });

    expect(
      getProjectStartupPlan({
        id: "project-1",
        name: "Example Service",
        rootPath,
      }),
    ).toMatchObject({
      databaseEnvKey: "APP_DATABASE_URL",
      migrationScript: "prisma:migrate:deploy",
      projectKind: "prisma-postgres",
    });
  });

  it("does not prepare a non-PostgreSQL Prisma configuration", () => {
    const rootPath = createProjectRoot({
      prismaConfig: 'url: process.env["APP_DATABASE_URL"]',
      provider: "sqlite",
      scripts: {
        "prisma:migrate:deploy": "prisma migrate deploy --schema ./prisma/schema.prisma",
      },
    });

    expect(
      getProjectStartupPlan({
        id: "project-1",
        name: "Example Service",
        rootPath,
      }),
    ).toBeNull();
  });
});

describe("extractPrismaDatabaseEnvKey", () => {
  it.each([
    ['datasource: { url: env("APP_DATABASE_URL") }', "APP_DATABASE_URL"],
    ['url: process.env["SERVICE_DATABASE_URL"]', "SERVICE_DATABASE_URL"],
    ["url: process.env.PRIMARY_DATABASE_URL", "PRIMARY_DATABASE_URL"],
  ])("reads the supported Prisma config form %s", (config, expected) => {
    expect(extractPrismaDatabaseEnvKey(config)).toBe(expected);
  });

  it("rejects unrelated environment variables", () => {
    expect(extractPrismaDatabaseEnvKey('url: process.env["API_TOKEN"]')).toBeNull();
  });
});

describe("createProjectStartupEnv", () => {
  it("loads project-local environment values without changing their roles", () => {
    const rootPath = createProjectRoot({
      env: [
        "APP_DATABASE_URL=postgresql://user:pass@localhost:5433/example_app?schema=public",
        "ANALYTICS_DATABASE_URL=postgresql://reader:pass@localhost:5433/example_analytics?schema=public",
      ].join("\n"),
      prismaConfig: 'url: process.env["APP_DATABASE_URL"]',
      scripts: {
        "prisma:migrate:deploy": "prisma migrate deploy --schema ./prisma/schema.prisma",
      },
    });

    const env = createProjectStartupEnv(resolve(rootPath, "server"), { env: {} });

    expect(env.APP_DATABASE_URL).toContain("/example_app?");
    expect(env.ANALYTICS_DATABASE_URL).toContain("/example_analytics?");
  });
});

describe("isProjectStartupAuthorized", () => {
  it("requires the exact registered project ID in the local allowlist", () => {
    const env = { HEPHA_PROJECT_STARTUP_ALLOWLIST: "project-1, project-3" };

    expect(isProjectStartupAuthorized("project-1", env)).toBe(true);
    expect(isProjectStartupAuthorized("project-2", env)).toBe(false);
  });

  it("fails closed when the allowlist is absent", () => {
    expect(isProjectStartupAuthorized("project-1", {})).toBe(false);
  });
});

function createProjectRoot({
  env,
  prismaConfig,
  provider,
  scripts,
}: {
  env?: string;
  prismaConfig: string;
  provider?: "postgresql" | "sqlite";
  scripts: Record<string, string>;
}) {
  const rootPath = mkdtempSync(resolve(tmpdir(), "hepha-project-"));
  const serverPath = resolve(rootPath, "server");

  tempRoots.push(rootPath);
  mkdirSync(resolve(serverPath, "prisma"), { recursive: true });
  writeFileSync(resolve(serverPath, "package.json"), JSON.stringify({ scripts }, null, 2), "utf8");
  writeFileSync(resolve(serverPath, "prisma.config.ts"), prismaConfig, "utf8");
  writeFileSync(
    resolve(serverPath, "prisma", "schema.prisma"),
    `datasource db { provider = "${provider ?? "postgresql"}" }`,
    "utf8",
  );

  if (env) {
    writeFileSync(resolve(serverPath, ".env"), env, "utf8");
  }

  return rootPath;
}
