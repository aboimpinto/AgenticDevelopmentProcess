import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CardMetadataStore } from "@hepha/db";
import { MANUAL_TEST_SKIP_REASON, persistManualTestObligation } from "../src/manual-test-obligation.js";
import { buildManualTestDeliveryModel } from "../src/manual-test-verification/delivery-model.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { force: true, recursive: true })));

function fixture(criteria: string[], evidence: string[] = []) {
  const projectRoot = mkdtempSync(join(tmpdir(), "hepha-delivery-classification-"));
  roots.push(projectRoot);
  const featureRoot = join(projectRoot, "MemoryBank", "Features", "03_IN_PROGRESS", "feature");
  mkdirSync(featureRoot, { recursive: true });
  const descriptionPath = join(featureRoot, "FeatureDescription.md");
  writeFileSync(descriptionPath, ["# Generic feature", "", "## Acceptance Criteria", "", ...criteria.map((line) => `- [ ] ${line}`)].join("\n"));
  if (evidence.length > 0) writeFileSync(join(featureRoot, "acceptance-traceability-ledger.md"), evidence.join("\n"));
  const store = {
    listFinalVerificationRuns: async () => [],
    listFinalVerificationChecks: async () => [],
  } as unknown as CardMetadataStore;
  return {
    featureRoot,
    descriptionPath,
    context: {
      projectRoot, projectId: "project", cardKey: "feature:GENERIC", featExternalId: "GENERIC",
      featTitle: "Generic feature", epicExternalId: null, featFolderPath: featureRoot, store,
    },
    options: { featDescriptionPath: descriptionPath, epicDescriptionPath: null, epicAcceptanceTestsPath: null, gherkinPaths: [] },
  };
}

function addValidManualCase(target: ReturnType<typeof fixture>, taskId = "AC-UI-001") {
  persistManualTestObligation(target.featureRoot, "GENERIC", {
    schemaVersion: "hepha-manual-test-deferral/v1",
    id: "MT-UI-001",
    title: `${taskId} account panel licence display`,
    reason: MANUAL_TEST_SKIP_REASON,
    phaseNumber: 5,
    taskId,
    preconditions: ["The staging web client is deployed", "A test account with the Direct Free plan exists"],
    steps: ["Open the example staging web client", "Sign in with the licensed test account", "Select the account flyout"],
    expectedResult: "The flyout displays Direct Free and the 100-voter limit.",
    evidenceRequirements: ["Screenshot of the account flyout"],
  });
}

describe("generic acceptance-aware manual test delivery", () => {
  it("binds all generic Gherkin scenarios", () => {
    const specification = readFileSync(join(import.meta.dirname, "generic-manual-test-delivery-classification.feature"), "utf8");
    expect(specification.match(/^\s*Scenario:/gm)).toHaveLength(4);
    expect(specification).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+/i);
  });

  it("marks an automated backend-only feature not applicable without fabricated cases", async () => {
    const target = fixture([
      "**AC-DOMAIN-001:** The immutable catalogue uses ordinal plan identifiers.",
      "**AC-DOMAIN-002:** Schema and deterministic digest validation reject invalid assets.",
    ], [
      "| AC-DOMAIN-001 | `LicenceDomainTests` and architecture tests passed |",
      "| AC-DOMAIN-002 | `CatalogueValidatorTests` and digest fixture verifier passed |",
    ]);
    const model = await buildManualTestDeliveryModel(target.context, target.options);
    expect(model.coverageMap.map((entry) => entry.coverageStatus)).toEqual(["automated", "automated"]);
    expect(model.applicability).toBe("not_applicable");
    expect(model.tests).toEqual([]);
  });

  it("publishes only a validated concrete manual workflow", async () => {
    const target = fixture(["**AC-UI-001:** The signed-in owner sees the licence in the account flyout."]);
    addValidManualCase(target);
    const model = await buildManualTestDeliveryModel(target.context, target.options);
    expect(model.applicability).toBe("applicable");
    expect(model.tests.map((test) => test.id)).toEqual(["MT-UI-001"]);
    expect(model.coverageMap.find((entry) => entry.sourceId === "AC-UI-001")?.coverageStatus).toBe("manual");
  });

  it("keeps automated criteria out of a mixed manual package", async () => {
    const target = fixture([
      "**AC-UI-001:** The owner sees the licence in the account flyout.",
      "**AC-DOMAIN-001:** The immutable licence value compares ordinally.",
    ], ["| AC-DOMAIN-001 | `LicenceValueTests` passed |"]);
    addValidManualCase(target);
    const model = await buildManualTestDeliveryModel(target.context, target.options);
    expect(model.tests).toHaveLength(1);
    expect(model.coverageMap.find((entry) => entry.sourceId === "AC-DOMAIN-001")?.coverageStatus).toBe("automated");
  });

  it("rejects generic placeholder instructions and never reports ready", async () => {
    const target = fixture(["**AC-UI-001:** The owner sees the implemented user experience."]);
    persistManualTestObligation(target.featureRoot, "GENERIC", {
      schemaVersion: "hepha-manual-test-deferral/v1",
      id: "MT-UI-001", title: "AC-UI-001 placeholder", reason: MANUAL_TEST_SKIP_REASON,
      phaseNumber: 5, taskId: "AC-UI-001", preconditions: ["The feature under test is available"],
      steps: ["Navigate to the feature area", "Perform the expected user workflow"],
      expectedResult: "Verify the observed behavior matches the acceptance criterion",
      evidenceRequirements: ["Evidence"],
    });
    const model = await buildManualTestDeliveryModel(target.context, target.options);
    expect(model.tests).toEqual([]);
    expect(model.invalidManualTests[0]?.errors.length).toBeGreaterThan(0);
    expect(model.applicability).toBe("incomplete");
  });
});
