import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readReviewContractRepairSources } from "../src/workflows/reviews/review-contract-repair-source-repository.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture(withCatalog: boolean) {
  const root = mkdtempSync(resolve(tmpdir(), "hepha-review-repair-"));
  temporaryRoots.push(root);
  const schemaRoot = resolve(root, ".hepha", "schemas");
  mkdirSync(schemaRoot, { recursive: true });
  writeFileSync(resolve(schemaRoot, "review-manifest-v1.schema.json"), "MANIFEST", "utf8");
  writeFileSync(resolve(schemaRoot, "common-review-contract-types-v1.schema.json"), "COMMON", "utf8");
  if (withCatalog) writeFileSync(resolve(root, ".hepha", "architecture-rules.yaml"), "CATALOG", "utf8");
  return root;
}

describe("review contract repair source repository", () => {
  it("reads both mandatory schemas and the active catalog", () => {
    expect(readReviewContractRepairSources(fixture(true))).toEqual({
      activeRuleCatalog: "CATALOG",
      commonSchema: "COMMON",
      manifestSchema: "MANIFEST",
    });
  });

  it("uses an explicit catalog-unavailable marker when the optional catalog is absent", () => {
    expect(readReviewContractRepairSources(fixture(false)).activeRuleCatalog).toBe("Catalog unavailable.");
  });
});
