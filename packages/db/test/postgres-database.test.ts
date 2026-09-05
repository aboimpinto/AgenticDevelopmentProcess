import { describe, expect, it } from "vitest";
import { getPostgresDatabaseTarget } from "../src/index.js";

describe("getPostgresDatabaseTarget", () => {
  it("extracts the target database and connects maintenance operations to postgres", () => {
    const target = getPostgresDatabaseTarget(
      "postgresql://user:password@localhost:5433/example_app?schema=public",
    );

    expect(target.databaseName).toBe("example_app");
    expect(target.maintenanceConnectionString).toBe(
      "postgresql://user:password@localhost:5433/postgres",
    );
  });

  it("preserves PostgreSQL connection parameters that are not Prisma schema selectors", () => {
    const target = getPostgresDatabaseTarget(
      "postgresql://user:password@db.example.com:5432/example_app?schema=public&sslmode=require",
    );

    expect(target.maintenanceConnectionString).toBe(
      "postgresql://user:password@db.example.com:5432/postgres?sslmode=require",
    );
  });

  it("rejects URLs without a database name", () => {
    expect(() => getPostgresDatabaseTarget("postgresql://user:password@localhost:5432")).toThrow(
      "database name",
    );
  });
});
