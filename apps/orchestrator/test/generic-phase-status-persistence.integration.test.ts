import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { replaceImplementationPhaseStatusLine } from "../src/workflows/phases/phase-status-document-repository.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-status-persistence.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const workerCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-worker-applications.ts", import.meta.url)),
  "utf8",
);
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic phase status persistence Gherkin integration", () => {
  it("specifies lifecycle, rerun, and approval persistence without fixed identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds phase applications to the extracted document repository", () => {
    expect(replaceImplementationPhaseStatusLine("**Status:** PENDING\n", "COMPLETED"))
      .toBe("**Status:** COMPLETED\n");
    expect(infrastructureSource).toContain("new PhaseStatusDocumentRepository");
    expect(orchestratorSource).toContain("statusDocuments: phaseStatusDocumentRepository");
    expect(workerCompositionSource).toContain("dependencies.statusDocuments.markAwaitingReviewRerun");
    expect(orchestratorSource).not.toContain("function markImplementationPhaseAwaitingCodeReviewRerun");
  });
});
