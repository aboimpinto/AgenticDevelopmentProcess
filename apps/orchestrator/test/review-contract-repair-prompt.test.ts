import { describe, expect, it } from "vitest";
import { buildReviewContractRepairPrompt } from "../src/workflows/prompts/review-contract-repair-prompt.js";

const sources = {
  activeRuleCatalog: "CATALOG_SOURCE",
  commonSchema: "COMMON_SCHEMA_SOURCE",
  manifestSchema: "MANIFEST_SCHEMA_SOURCE",
};
const options = {
  artifactId: "artifact-x",
  attempt: 2,
  draft: "REJECTED_DRAFT",
  maximumAttempts: 5,
  rejectionCode: "invalid_contract",
  rejectionMessage: "field mismatch",
  scope: {
    featureId: "capability-x",
    phaseNumber: 17,
    projectId: "project-x",
    reviewGateId: "code-review" as const,
  },
};

describe("review contract repair prompt", () => {
  it("binds exact validator rejection, immutable identity, schemas, catalog, and draft", () => {
    const prompt = buildReviewContractRepairPrompt(options, sources);
    expect(prompt).toContain("Repair attempt: 2 of 5");
    expect(prompt).toContain("Safe validator rejection: invalid_contract — field mismatch");
    expect(prompt).toContain('Use this exact artifactId: "artifact-x"');
    expect(prompt).toContain('"featureId":"capability-x"');
    expect(prompt).toContain("MANIFEST_SCHEMA_SOURCE");
    expect(prompt).toContain("COMMON_SCHEMA_SOURCE");
    expect(prompt).toContain("CATALOG_SOURCE");
    expect(prompt).toContain("REJECTED_DRAFT");
  });

  it("allows only representation repair and exactly one raw JSON response", () => {
    const prompt = buildReviewContractRepairPrompt(options, sources);
    expect(prompt).toContain("Repair only the JSON contract representation");
    expect(prompt).toContain("Do not review code, inspect files, run commands, edit files, add findings, remove findings, change the review result");
    expect(prompt).toContain("Correct only fields needed");
    expect(prompt).toContain("Return exactly one raw JSON object and nothing else");
  });

  it("requires canonical acceptance authority and POSIX relative paths", () => {
    const prompt = buildReviewContractRepairPrompt(options, sources);
    expect(prompt).toContain('"ac:capability-x:<criterionId>"');
    expect(prompt).toContain("feature segment must exactly equal scope.featureId");
    expect(prompt).toContain("source.relativePath must be a POSIX path relative to the project root");
    expect(prompt).toContain("copy its complete snapshot exactly");
  });

  it("forbids lineage on a baseline and binds exact predecessor lineage on a rerun", () => {
    expect(buildReviewContractRepairPrompt(options, sources)).toContain("baseline review. Do not add lineage");
    const predecessor = {
      artifactId: "previous",
      contentHash: "a".repeat(64),
      relativePath: ".hepha/reviews/previous.json",
    };
    const prompt = buildReviewContractRepairPrompt({
      ...options,
      lineage: { kind: "required", predecessor, findings: [] },
    }, sources);
    expect(prompt).toContain(JSON.stringify({ lineage: { predecessors: [predecessor] } }));
    expect(prompt).toContain("do not alter it");
  });
});
