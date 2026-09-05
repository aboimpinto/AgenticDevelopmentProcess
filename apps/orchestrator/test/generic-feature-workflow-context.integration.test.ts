import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FeatureWorkflowContextCollector } from "../src/application/context/feature-workflow-context-collector.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-feature-workflow-context.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic feature workflow context Gherkin integration", () => {
  it("specifies default, code-review, and missing context without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds every feature workflow context request to the extracted collector", () => {
    expect(FeatureWorkflowContextCollector).toBeTypeOf("function");
    expect(orchestratorSource).toContain("new FeatureWorkflowContextCollector");
    expect(orchestratorSource).toContain("featureWorkflowContextCollector.collect");
    expect(orchestratorSource).not.toContain("function collectLinkedEpicAcceptanceTests");
    expect(orchestratorSource).not.toContain("function collectMarkdownDocuments");
    expect(orchestratorSource).not.toContain("function renderCodeReviewScopeContext");
  });
});
