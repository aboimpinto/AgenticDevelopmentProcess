import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  DatabaseSettings,
  EnsurePostgresDatabaseResult,
  PostgresDatabaseTarget,
} from "../contracts/index.js";

const defaultDatabasePath = resolve(process.cwd(), ".hepha", "hepha.sqlite");

export function readDatabaseSettings(
  env: Record<string, string | undefined>,
): DatabaseSettings {
  return { databasePath: resolveSqliteDatabasePath(env) };
}

export function resolveSqliteDatabasePath(
  env: Record<string, string | undefined>,
): string {
  const configuredPath = env.HEPHA_DATABASE_PATH?.trim();

  if (configuredPath) {
    return normalizeSqlitePath(configuredPath, defaultDatabasePath);
  }

  const configuredUrl = env.DATABASE_URL?.trim();

  if (configuredUrl) {
    return normalizeSqlitePath(configuredUrl, defaultDatabasePath);
  }

  return defaultDatabasePath;
}

export function getPostgresDatabaseTarget(databaseUrl: string): PostgresDatabaseTarget {
  const targetUrl = new URL(databaseUrl);
  const databaseName = decodeURIComponent(targetUrl.pathname.replace(/^\/+/, ""));

  if (!databaseName) {
    throw new Error("PostgreSQL database URL must include a database name.");
  }

  const maintenanceUrl = new URL(databaseUrl);

  maintenanceUrl.pathname = "/postgres";
  maintenanceUrl.searchParams.delete("schema");

  return {
    databaseName,
    maintenanceConnectionString: maintenanceUrl.toString(),
  };
}

export async function ensurePostgresDatabaseExists(
  databaseUrl: string,
): Promise<EnsurePostgresDatabaseResult> {
  const target = getPostgresDatabaseTarget(databaseUrl);
  const pg = await import("pg");
  const Pool = pg.default?.Pool ?? pg.Pool;
  const pool = new Pool({ connectionString: target.maintenanceConnectionString });

  try {
    const existing = await pool.query("select 1 from pg_database where datname = $1", [
      target.databaseName,
    ]);

    if ((existing.rowCount ?? 0) > 0) {
      return { ...target, created: false };
    }

    try {
      await pool.query(`create database ${quotePostgresIdentifier(target.databaseName)}`);
    } catch (error) {
      if (!isDuplicateDatabaseError(error)) {
        throw error;
      }
    }

    return { ...target, created: true };
  } finally {
    await pool.end();
  }
}

export function normalizeSqlitePath(value: string, fallbackPath: string) {
  if (!value || isPostgresDatabaseUrl(value)) {
    return fallbackPath;
  }

  if (value === ":memory:") {
    return value;
  }

  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }

  if (value.startsWith("file:")) {
    return resolve(value.slice("file:".length));
  }

  if (value.startsWith("sqlite://")) {
    const pathname = decodeURIComponent(new URL(value).pathname);

    if (process.platform === "win32" && /^\/[A-Za-z]:/.test(pathname)) {
      return pathname.slice(1);
    }

    return pathname;
  }

  if (value.startsWith("sqlite:")) {
    return resolve(value.slice("sqlite:".length));
  }

  return resolve(value);
}

export function isPostgresDatabaseUrl(value: string) {
  return /^postgres(ql)?:\/\//i.test(value);
}

export function quotePostgresIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function isDuplicateDatabaseError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as Record<string, unknown>).code === "42P04"
  );
}
