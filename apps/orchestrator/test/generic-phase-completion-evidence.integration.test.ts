import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PhaseCompletionEvidenceReader } from "../src/workflows/phases/phase-completion-evidence-reader.js";

const feature = readFileSync(fileURLToPath(new URL("./generic-phase-completion-evidence.feature", import.meta.url)), "utf8");
const orchestratorSource = readFileSync(fileURLToPath(new URL("../src/index.ts", import.meta.url)), "utf8");
const entryCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-entry-applications.ts", import.meta.url)),
  "utf8",
);
const boundaryCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/phase-boundary-applications.ts", import.meta.url)),
  "utf8",
);
const humanReviewCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/human-review-phase-application.ts", import.meta.url)),
  "utf8",
);
const infrastructureSource = readFileSync(fileURLToPath(new URL("../src/bootstrap/workflow-infrastructure-applications.ts", import.meta.url)), "utf8");

describe("generic phase completion evidence Gherkin integration", () => {
  it("specifies durable completion evidence without work-item identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds phase exit, continuation, and human-review workflows to the reader", () => {
    expect(new PhaseCompletionEvidenceReader()).toBeInstanceOf(PhaseCompletionEvidenceReader);
    expect(infrastructureSource).toContain("new PhaseCompletionEvidenceReader");
    expect(orchestratorSource).toContain("completionEvidence: phaseCompletionEvidenceReader");
    expect(boundaryCompositionSource).toContain("dependencies.completionEvidence.has");
    expect(entryCompositionSource).toContain("dependencies.completionEvidence.summarize");
    expect(humanReviewCompositionSource).toContain("dependencies.completionEvidence.summarizeHumanReview");
    expect(orchestratorSource).not.toContain("function hasPhaseCompletionEvidence");
  });
});
