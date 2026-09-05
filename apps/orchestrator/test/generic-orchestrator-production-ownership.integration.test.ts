import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-orchestrator-production-ownership.feature", import.meta.url)),
  "utf8",
);
const orchestratorSource = readFileSync(
  fileURLToPath(new URL("../src/index.ts", import.meta.url)),
  "utf8",
);
const memoryBankScannerSource = readFileSync(
  fileURLToPath(new URL("../src/memorybank-scanner.ts", import.meta.url)),
  "utf8",
);
const featureProjectionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-projection-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic orchestrator production ownership Gherkin integration", () => {
  it("specifies production callers, test-only rejection, and extracted-owner composition", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).toContain("A composition-root helper has a production caller");
    expect(feature).toContain("A test-only helper does not justify production code");
    expect(feature).toContain("Extracted behavior remains wired into production");
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds extracted ownership to live production composition", () => {
    expect(featureProjectionSource).toContain("new FeatureWorkflowSummaryProjector");
    expect(featureProjectionSource).toContain("new FeatureWorkflowProgressProjector");
    expect(memoryBankScannerSource).toContain('from "./memorybank/phase-scanner.js"');
    expect(orchestratorSource).not.toContain("function scanFeaturePhases");
  });
});
