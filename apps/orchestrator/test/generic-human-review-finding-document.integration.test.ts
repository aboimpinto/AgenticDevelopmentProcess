import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HumanReviewFindingDocumentRepository } from "../src/application/features/human-review-finding-document-repository.js";

const feature = readFileSync(
  fileURLToPath(new URL("./generic-human-review-finding-document.feature", import.meta.url)),
  "utf8",
);
const preparationCompositionSource = readFileSync(
  fileURLToPath(new URL("../src/bootstrap/feature-preparation-applications.ts", import.meta.url)),
  "utf8",
);

describe("generic human review finding document Gherkin integration", () => {
  it("specifies creation, reuse, and migration without fixed work-item or phase identities", () => {
    expect(feature.match(/^\s*Scenario:/gm)).toHaveLength(3);
    expect(feature).toContain("The first finding creates one next-numbered findings phase");
    expect(feature).toContain("Later finding activity reuses the durable phase");
    expect(feature).toContain("An older findings document is upgraded safely");
    expect(feature).not.toMatch(/FEAT-\d+|Phase\s+\d+|Task\s+\d+/i);
  });

  it("binds the production composition to the extracted document repository", () => {
    expect(HumanReviewFindingDocumentRepository).toBeTypeOf("function");
    expect(preparationCompositionSource).toContain("new HumanReviewFindingDocumentRepository");
    expect(preparationCompositionSource).not.toContain("function ensureHumanReviewFindingsPhase");
    expect(preparationCompositionSource).not.toContain("function appendFindingToHumanReviewPhase");
  });
});
