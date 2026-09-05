import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SubmittedFeatureDocumentWriter } from "../src/application/features/submitted-feature-document-writer.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-submitted-feature-document.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const missingFeatureBatchSource = readFileSync(fileURLToPath(new URL("../src/application/features/missing-feature-batch-application.ts", import.meta.url)), "utf8");

describe("generic submitted-feature document Gherkin integration", () => {
  it("specifies explicit, planned, and no-overwrite behavior without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds missing-feature batch application to the extracted writer", () => {
    expect(new SubmittedFeatureDocumentWriter()).toBeInstanceOf(SubmittedFeatureDocumentWriter);
    expect(missingFeatureBatchSource).toContain("this.dependencies.documentWriter.createFromEpicReference");
    expect(missingFeatureBatchSource).toContain("this.dependencies.documentWriter.createFromPlan");
    expect(orchestratorSource).toContain("documentWriter: submittedFeatureDocumentWriter");
    expect(orchestratorSource).not.toContain("function createSubmittedFeatureFromEpicReference");
    expect(orchestratorSource).not.toContain("function createSubmittedFeatureFromPlan");
  });
});
