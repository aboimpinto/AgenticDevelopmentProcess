import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ReviewContractRepairSources {
  activeRuleCatalog: string;
  commonSchema: string;
  manifestSchema: string;
}

/** Reads the authoritative schemas and optional active-rule catalog for repair. */
export function readReviewContractRepairSources(projectRoot: string): ReviewContractRepairSources {
  const schemaRoot = resolve(projectRoot, ".hepha", "schemas");
  const catalogPath = resolve(projectRoot, ".hepha", "architecture-rules.yaml");
  return {
    activeRuleCatalog: existsSync(catalogPath) ? readFileSync(catalogPath, "utf8") : "Catalog unavailable.",
    commonSchema: readFileSync(resolve(schemaRoot, "common-review-contract-types-v1.schema.json"), "utf8"),
    manifestSchema: readFileSync(resolve(schemaRoot, "review-manifest-v1.schema.json"), "utf8"),
  };
}
