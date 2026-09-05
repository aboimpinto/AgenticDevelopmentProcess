import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-sqlite-schema-lifecycle.feature"), "utf8");
const schema = readFileSync(resolve(testRoot, "../src/sqlite/sqlite-metadata-schema.ts"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");

describe("generic SQLite schema lifecycle Gherkin integration", () => {
  it("specifies four identity-blind schema paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps schema ownership behind the production SQLite adapter", () => {
    expect(facade).toContain(
      'import { SqliteMetadataSchema } from "./sqlite/sqlite-metadata-schema.js"',
    );
    expect(facade).toContain("this.schema = new SqliteMetadataSchema(this.database)");
    expect(facade).toContain("this.schema.ensure()");
    expect(schema).toContain("export class SqliteMetadataSchema");
    expect(schema).toContain("create table if not exists hepha_card_metadata");
    expect(facade).not.toContain("create table if not exists hepha_card_metadata");
    expect(facade).not.toContain("private ensureColumns");
  });
});
