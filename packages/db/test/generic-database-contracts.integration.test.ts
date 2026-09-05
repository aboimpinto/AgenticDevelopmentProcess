import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const testRoot = resolve(import.meta.dirname);
const specification = readFileSync(resolve(testRoot, "generic-database-contracts.feature"), "utf8");
const facade = readFileSync(resolve(testRoot, "../src/index.ts"), "utf8");
const contracts = readFileSync(resolve(testRoot, "../src/contracts/index.ts"), "utf8");
const disabledAdapter = readFileSync(
  resolve(testRoot, "../src/adapters/disabled-card-metadata-store.ts"),
  "utf8",
);

describe("generic database contracts Gherkin integration", () => {
  it("specifies four identity-blind persistence paths", () => {
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|project-\d+/i);
  });

  it("keeps bounded contracts connected to both metadata adapters", () => {
    expect(contracts.match(/^export \* from/gm)).toHaveLength(10);
    expect(facade).toContain('export * from "./contracts/index.js"');
    expect(facade).toContain(
      'import { DisabledCardMetadataStore } from "./adapters/disabled-card-metadata-store.js"',
    );
    expect(disabledAdapter).toContain(
      "export class DisabledCardMetadataStore implements CardMetadataStore",
    );
    expect(facade).toContain("class SqliteCardMetadataStore implements CardMetadataStore");
    expect(facade).not.toContain("export interface CardMetadataStore");
  });
});
