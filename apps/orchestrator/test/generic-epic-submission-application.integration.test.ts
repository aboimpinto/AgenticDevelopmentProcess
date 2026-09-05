import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EpicSubmissionApplication } from "../src/application/epics/epic-submission-application.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-epic-submission-application.feature", import.meta.url)), "utf8");
const applicationSource = readFileSync(fileURLToPath(new URL("../src/application/epics/epic-submission-application.ts", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");

describe("generic EPIC submission application Gherkin integration", () => {
  it("specifies the generic authoring and persistence behavior without fixed workflow identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(5);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("owns idea expansion, finalization, allocation, persistence, and reload", () => {
    expect(EpicSubmissionApplication).toBeTypeOf("function");
    expect(applicationSource).toContain("buildSubmitEpicIdeaPrompt");
    expect(applicationSource).toContain("parseSubmitEpicIdeaResponse");
    expect(applicationSource).toContain("buildSubmitEpicFinalizerPrompt");
    expect(applicationSource).toContain("parseSubmitEpicFinalizerResponse");
    expect(applicationSource).toContain("renderSubmittedEpicDocument");
    expect(applicationSource).toContain("this.dependencies.idAllocator.nextEpic(project)");
    expect(applicationSource).toContain('timeoutLabel: "Submit EPIC idea Pi run"');
    expect(applicationSource).toContain('timeoutLabel: "Submit EPIC finalizer Pi run"');
  });

  it("leaves the composition root with delegation instead of implementation", () => {
    expect(orchestratorSource).toContain("epicSubmissionApplication.submit(input)");
    expect(orchestratorSource).not.toContain("async function submitEpic");
    expect(orchestratorSource).not.toContain("function resolveSubmitEpicInput");
    expect(orchestratorSource).not.toContain("function resolveSubmitEpicIdeaDraft");
  });
});
