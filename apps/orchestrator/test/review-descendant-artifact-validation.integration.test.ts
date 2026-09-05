import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { buildStrictRuleSnapshot, type StrictActiveRuleCatalog, type StrictCatalogRule } from "../src/review-contract-catalog.js";
import { validateDebtObservation } from "../src/review-contract-policy/debt-observation-validation.js";
import { validateRemediationResponse } from "../src/review-contract-policy/remediation-validation.js";
import { validateReplanPlan } from "../src/review-contract-policy/replan-validation.js";
import { runValidationPipeline } from "../src/review-contract-policy/validation-pipeline.js";
import { validateVerificationReceipt } from "../src/review-contract-policy/verification-receipt-validation.js";
import type { ManifestPredecessorContext, ResponsePredecessorContext } from "../src/review-contract-policy/policy-types.js";
import {
  buildValidActiveRuleSnapshot,
  buildValidArtifactReference,
  buildValidArtifactScope,
  buildValidDebtObservation,
  buildValidFinding,
  buildValidManifest,
  buildValidRemediationResponse,
  buildValidReplanPlan,
  buildValidSurface,
  buildValidSurfaceEntry,
  buildValidVerificationReceipt,
} from "../src/review-contract-types.js";

const featurePath = fileURLToPath(new URL("./review-descendant-artifact-validation.feature", import.meta.url));
const facadePath = fileURLToPath(new URL("../src/review-contract-policy.ts", import.meta.url));

function manifestContext(): ManifestPredecessorContext {
  return {
    manifest: buildValidManifest(),
    reference: buildValidArtifactReference(),
    scope: buildValidArtifactScope(),
  };
}

function responseContext(): ResponsePredecessorContext {
  return {
    response: buildValidRemediationResponse(),
    reference: buildValidArtifactReference({
      artifactKind: "remediation_response",
      artifactId: "response-001",
    }),
    scope: buildValidArtifactScope(),
  };
}

describe("generic descendant review artifact Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps product-blind scenarios connected to every narrow production validator", () => {
    expect(feature.match(/Scenario:/g)).toHaveLength(5);
    expect(feature).not.toMatch(/FEAT-\d+|EPIC-\d+|Phase \d+|task \d+/i);
    const facade = readFileSync(facadePath, "utf8");
    for (const moduleName of [
      "remediation-validation",
      "verification-receipt-validation",
      "replan-validation",
      "debt-observation-validation",
      "validation-pipeline",
    ]) {
      expect(facade).toContain(`./review-contract-policy/${moduleName}.js`);
    }
  });

  it("executes remediation, receipt, and replan predecessor bindings", () => {
    const manifest = manifestContext();
    const response = responseContext();
    expect(validateRemediationResponse(buildValidRemediationResponse(), manifest).valid).toBe(true);
    expect(validateVerificationReceipt(buildValidVerificationReceipt(), manifest, response).valid).toBe(true);

    const replanManifest: ManifestPredecessorContext = {
      manifest: buildValidManifest({
        findings: [buildValidFinding({
          findingId: "finding-001",
          defectClass: "secret-exposure",
          disposition: "IN_SCOPE_BLOCKER",
          exhaustivenessDecision: "replan_required",
        })],
      }),
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    expect(validateReplanPlan(buildValidReplanPlan(), replanManifest).valid).toBe(true);
  });

  it("executes active catalog binding for a non-blocking debt observation", () => {
    const rule: StrictCatalogRule = {
      id: "secret-safe-governance-artifacts",
      version: "1.0.0",
      status: "active",
      category: "security",
      scope: "review-governance",
      title: "Secret-Safe Governance Artifacts",
      description: "Governance artifacts remain secret-safe.",
      source: { document: "docs/review.md", section: "Secret Safety" },
    };
    const sourceHash = "e".repeat(64);
    const strictSnapshot = buildStrictRuleSnapshot(rule, sourceHash);
    const snapshot = buildValidActiveRuleSnapshot({
      ...strictSnapshot,
      source: strictSnapshot.source,
    });
    const catalog: StrictActiveRuleCatalog = {
      catalogId: "debt-catalog",
      schemaVersion: 1,
      rules: [rule],
      catalogSourceHash: sourceHash,
    };
    const debtManifest: ManifestPredecessorContext = {
      manifest: buildValidManifest({
        ruleSnapshots: [snapshot],
        findings: [buildValidFinding({
          findingId: "finding-arch-debt-001",
          disposition: "ARCHITECTURE_DEBT",
          claimType: "security",
          severity: "critical",
          rootCause: undefined,
          remediationItems: undefined,
          testMatrix: undefined,
          exhaustivenessDecision: undefined,
          compatibilityDecision: undefined,
          debtImpact: "untouched_non_blocking",
          surface: buildValidSurface({
            inspected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })],
            affected: [buildValidSurfaceEntry({ surfaceId: "src-lib-core-a", relativePath: "src/lib/core.ts" })],
            confirmedUnaffected: [],
          }),
          authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
        })],
      }),
      reference: buildValidArtifactReference(),
      scope: buildValidArtifactScope(),
    };
    const observation = buildValidDebtObservation({
      authority: { kind: "active_rule", reference: `rule:${rule.id}`, snapshot },
    });
    expect(validateDebtObservation(observation, debtManifest, undefined, undefined, catalog).valid).toBe(true);
  });

  it("executes ordered first-refusal behavior", () => {
    const laterCheck = vi.fn(() => undefined);
    expect(runValidationPipeline([
      { name: "refuse", check: () => ({ valid: false, code: "invalid_shape", message: "Artifact has an invalid structure." }) },
      { name: "later", check: laterCheck },
    ])).toMatchObject({ code: "invalid_shape" });
    expect(laterCheck).not.toHaveBeenCalled();
  });
});
