import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildDeepDiveDocumentUpdatePrompt,
  DeepDiveDocumentUpdater,
} from "../src/application/deep-dive/deep-dive-document-updater.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-deep-dive-document-update.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const compositionSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/deep-dive-applications.ts", import.meta.url)), "utf8");

describe("generic Deep-Dive document update Gherkin integration", () => {
  it("specifies model, size-boundary, and recovery behavior without fixed work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds Deep-Dive completion to the extracted updater", () => {
    expect(DeepDiveDocumentUpdater).toBeTypeOf("function");
    expect(orchestratorSource).toContain("createDeepDiveApplications({");
    expect(compositionSource).toContain("new DeepDiveDocumentUpdater");
    expect(compositionSource).toContain("deepDiveDocumentUpdater.update");
    expect(orchestratorSource).not.toContain("function createUpdatedWorkItemDocument");
    expect(orchestratorSource).not.toContain("function buildDocumentUpdatePrompt");
  });

  it("keeps the stage-two contract explicit in the extracted prompt", () => {
    expect(buildDeepDiveDocumentUpdatePrompt).toBeTypeOf("function");
    expect(buildDeepDiveDocumentUpdatePrompt.toString()).toContain("This is Deep-Dive stage 2 only");
  });
});
