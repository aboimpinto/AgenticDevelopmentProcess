import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pgHarness = vi.hoisted(() => {
  const query = vi.fn();
  const end = vi.fn().mockResolvedValue(undefined);
  class Pool {
    readonly end = end;
    readonly query = query;
  }

  return { end, Pool, query };
});

vi.mock("pg", () => ({ default: { Pool: pgHarness.Pool }, Pool: pgHarness.Pool }));

import {
  ensurePostgresDatabaseExists,
  getPostgresDatabaseTarget,
  isDuplicateDatabaseError,
  isPostgresDatabaseUrl,
  normalizeSqlitePath,
  quotePostgresIdentifier,
  readDatabaseSettings,
  resolveSqliteDatabasePath,
} from "../src/configuration/database-configuration.js";

describe("database configuration", () => {
  beforeEach(() => {
    pgHarness.query.mockReset();
    pgHarness.end.mockClear();
  });

  it("resolves explicit SQLite paths before compatible URL settings", () => {
    expect(resolveSqliteDatabasePath({ HEPHA_DATABASE_PATH: ":memory:" })).toBe(":memory:");
    expect(
      resolveSqliteDatabasePath({
        DATABASE_URL: "sqlite:secondary.sqlite",
        HEPHA_DATABASE_PATH: "primary.sqlite",
      }),
    ).toBe(resolve("primary.sqlite"));
    expect(readDatabaseSettings({ DATABASE_URL: "file:metadata.sqlite" })).toEqual({
      databasePath: resolve("metadata.sqlite"),
    });
    expect(resolveSqliteDatabasePath({})).toBe(resolve(".hepha", "hepha.sqlite"));
  });

  it("normalizes supported SQLite forms and refuses PostgreSQL as a SQLite path", () => {
    const fallback = resolve("fallback.sqlite");

    expect(normalizeSqlitePath("", fallback)).toBe(fallback);
    expect(normalizeSqlitePath("postgresql://db.example/app", fallback)).toBe(fallback);
    expect(normalizeSqlitePath(":memory:", fallback)).toBe(":memory:");
    expect(normalizeSqlitePath("file:relative.sqlite", fallback)).toBe(resolve("relative.sqlite"));
    expect(normalizeSqlitePath("sqlite:relative.sqlite", fallback)).toBe(resolve("relative.sqlite"));
    expect(normalizeSqlitePath("file:///tmp/a%20b.sqlite", fallback)).toBe("/tmp/a b.sqlite");
    expect(normalizeSqlitePath("sqlite:///tmp/a%20b.sqlite", fallback)).toBe("/tmp/a b.sqlite");
    expect(isPostgresDatabaseUrl("postgres://db.example/app")).toBe(true);
    expect(isPostgresDatabaseUrl("sqlite:app.sqlite")).toBe(false);
  });

  it("derives a safe PostgreSQL maintenance target and quotes identifiers", () => {
    expect(
      getPostgresDatabaseTarget(
        "postgresql://user:secret@db.example:5432/my%20database?schema=public&sslmode=require",
      ),
    ).toEqual({
      databaseName: "my database",
      maintenanceConnectionString:
        "postgresql://user:secret@db.example:5432/postgres?sslmode=require",
    });
    expect(() => getPostgresDatabaseTarget("postgresql://db.example:5432")).toThrow(
      "database name",
    );
    expect(quotePostgresIdentifier('name"suffix')).toBe('"name""suffix"');
    expect(isDuplicateDatabaseError({ code: "42P04" })).toBe(true);
    expect(isDuplicateDatabaseError({ code: "other" })).toBe(false);
  });

  it("reuses an existing PostgreSQL database and always closes the pool", async () => {
    pgHarness.query.mockResolvedValueOnce({ rowCount: 1 });

    await expect(
      ensurePostgresDatabaseExists("postgresql://user:secret@db.example:5432/application"),
    ).resolves.toMatchObject({ created: false, databaseName: "application" });
    expect(pgHarness.query).toHaveBeenCalledOnce();
    expect(pgHarness.end).toHaveBeenCalledOnce();
  });

  it("creates a missing PostgreSQL database and tolerates a concurrent creator", async () => {
    pgHarness.query
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockRejectedValueOnce(Object.assign(new Error("already exists"), { code: "42P04" }));

    await expect(
      ensurePostgresDatabaseExists("postgresql://user:secret@db.example:5432/application"),
    ).resolves.toMatchObject({ created: true, databaseName: "application" });
    expect(pgHarness.query).toHaveBeenLastCalledWith('create database "application"');
    expect(pgHarness.end).toHaveBeenCalledOnce();
  });

  it("propagates unexpected PostgreSQL creation failures after closing the pool", async () => {
    const failure = new Error("permission denied");
    pgHarness.query.mockResolvedValueOnce({ rowCount: 0 }).mockRejectedValueOnce(failure);

    await expect(
      ensurePostgresDatabaseExists("postgresql://user:secret@db.example:5432/application"),
    ).rejects.toBe(failure);
    expect(pgHarness.end).toHaveBeenCalledOnce();
  });
});
