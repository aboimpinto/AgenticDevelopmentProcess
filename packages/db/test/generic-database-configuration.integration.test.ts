import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-database-configuration.feature"), "utf8");
const configuration = readFileSync(
  resolve(testRoot, "../src/configuration/database-configuration.ts"),
  "utf8",
);
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const startup = readFileSync(resolve(testRoot, "../../../apps/orchestrator/src/project-startup.ts"), "utf8");

describe("generic database configuration Gherkin integration", () => {
  it("specifies four identity-blind configuration paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("connects bounded configuration to adapter and project-startup owners", () => {
    expect(facade).toContain('export * from "./configuration/database-configuration.js"');
    expect(facade).toContain("resolveSqliteDatabasePath(env)");
    expect(startup).toContain('import { ensurePostgresDatabaseExists } from "@hepha/db"');
    expect(configuration).toContain("export function resolveSqliteDatabasePath");
    expect(configuration).toContain("export async function ensurePostgresDatabaseExists");
    expect(facade).not.toContain("function normalizeSqlitePath");
    expect(facade).not.toContain("function quotePostgresIdentifier");
  });
});
