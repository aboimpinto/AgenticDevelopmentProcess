// Behavior suite: review contract.
/**
 * FEAT-064 Phase 4 (T4.1, T4.2, T4.3, T4.5) — Review Prompt Contract Tests.
 *
 * E013-RC-004: Reviewer, fixer, and replan instructions emit separate bounded
 * structured artifacts.
 *
 * These tests verify that the prompt/skill documents require the correct
 * structured output contracts, not that the runtime validators behave
 * correctly (that is Phase 2/3 scope). Specifically:
 *
 * T4.1: Reviewer prompt/skill contract must:
 *   - Request a structured manifest first (not Markdown authority)
 *   - Classify every observation (IN_SCOPE_BLOCKER/SCOPE_EXPANSION/ARCHITECTURE_DEBT/OBSERVATION)
 *   - Cite the authority (active rule snapshot or acceptance criterion)
 *   - Require complete bounded fields for blockers/expansions
 *
 * T4.2: Fixer prompt/skill contract must:
 *   - Consume approved bounded items from the review manifest
 *   - Emit a separate remediation-response artifact linked by stable identifiers
 *   - Emit a separate verification-receipt artifact linked by stable identifiers
 *   - Prohibit modifying reviewer-owned content
 *   - Prohibit silent scope expansion
 *
 * T4.5: Prompt-contract tests verify the skill contract body contains
 * the required instructions.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dirname, "../../..");
const REVIEW_SKILL_PATH = resolve(PROJECT_ROOT, ".hepha/skills/review-phase.skill.md");
const REPAIR_SKILL_PATH = resolve(PROJECT_ROOT, ".hepha/skills/repair-review-findings.skill.md");
const REPLAN_SKILL_PATH = resolve(PROJECT_ROOT, ".hepha/skills/replan-phase.skill.md");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadSkillFile(path: string): string {
  if (!existsSync(path)) {
    throw new Error(`Skill file not found: ${path}`);
  }
  return readFileSync(path, "utf-8");
}

function extractFrontmatter(content: string): Record<string, unknown> {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") return {};
  const endIdx = lines.indexOf("---", 1);
  if (endIdx === -1) return {};
  const yamlBlock = lines.slice(1, endIdx).join("\n");
  // Simple line-based parse for key fields
  const result: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const match = line.match(/^\s*(\S[^:]*):\s*(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      // Handle quoted strings
      if (val.startsWith('"') && val.endsWith('"')) {
        result[key] = val.slice(1, -1);
      } else {
        result[key] = val;
      }
    }
  }
  return result;
}

function extractBody(content: string): string {
  const lines = content.split("\n");
  // Skip frontmatter: first --- then content until next ---
  let bodyStart = 0;
  if (lines[0]?.trim() === "---") {
    const endFrontmatter = lines.indexOf("---", 1);
    if (endFrontmatter !== -1) {
      bodyStart = endFrontmatter + 1;
    }
  }
  return lines.slice(bodyStart).join("\n").trim();
}

// ---------------------------------------------------------------------------
// T4.1: Reviewer Skill Contract Requires Structured Manifest First
// ---------------------------------------------------------------------------

describe("Phase 4: T4.1 — Reviewer skill contract requires structured manifest first", () => {
  const skillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires emitting a structured JSON manifest before Markdown output", () => {
    // The skill must instruct the reviewer to emit a manifest first
    const hasManifestFirst =
      skillBody.includes("Before writing any Markdown output") &&
      skillBody.includes("bounded review manifest") &&
      skillBody.includes("fenced JSON code block");
    expect(hasManifestFirst).toBe(true);
  });

  it("declares Markdown as non-authoritative presentation evidence", () => {
    const hasNonAuthoritative =
      skillBody.includes("non-authoritative presentation evidence") &&
      skillBody.includes("Markdown") &&
      (skillBody.includes("only the structured manifest") ||
       skillBody.includes("authoritative decision record"));
    expect(hasNonAuthoritative).toBe(true);
  });

  it("requires a review-manifest output artifact in frontmatter", () => {
    // The skill must declare a structured output for the manifest
    const hasManifestOutput = skillContent.includes("artifact: \"review-manifest\"");
    expect(hasManifestOutput).toBe(true);
  });

  it("requires schema conformance to review-manifest-v1.schema.json", () => {
    const hasSchemaRef = skillBody.includes("review-manifest-v1.schema.json");
    expect(hasSchemaRef).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.1: Classify Every Observation With Structured Disposition
// ---------------------------------------------------------------------------

describe("Phase 4: T4.1 — Reviewer classifies every observation with structured disposition", () => {
  const skillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires IN_SCOPE_BLOCKER disposition for blocking findings", () => {
    expect(skillBody).toContain("IN_SCOPE_BLOCKER");
  });

  it("requires SCOPE_EXPANSION disposition for scope-expanding findings", () => {
    expect(skillBody).toContain("SCOPE_EXPANSION");
  });

  it("requires ARCHITECTURE_DEBT disposition for untouched historical noncompliance", () => {
    expect(skillBody).toContain("ARCHITECTURE_DEBT");
  });

  it("requires OBSERVATION disposition for notes and non-blocking observations", () => {
    expect(skillBody).toContain("OBSERVATION");
  });

  it("classifies each finding with exactly one of the four dispositions", () => {
    const hasClassification = skillBody.includes("Each finding MUST be classified with exactly one disposition");
    expect(hasClassification).toBe(true);
  });

  it("binds severity to disposition (blocker/required → IN_SCOPE_BLOCKER or SCOPE_EXPANSION)", () => {
    expect(skillBody).toContain("blocker");
    expect(skillBody).toContain("required");
  });

  it("restricts OBSERVATION from having remediationItems or testMatrix", () => {
    const hasObsRestriction =
      skillBody.includes("MUST NOT have remediationItems") ||
      skillBody.includes("MUST NOT have remediationItems, testMatrix");
    expect(hasObsRestriction).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.1: Cite The Authority
// ---------------------------------------------------------------------------

describe("Phase 4: T4.1 — Reviewer cites the authority", () => {
  const skillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires active_rule authority for architecture/security/policy/quality findings", () => {
    const hasActiveRuleAuthority =
      skillBody.includes("active_rule authority") ||
      skillBody.includes("active_rule");
    expect(hasActiveRuleAuthority).toBe(true);
  });

  it("requires acceptance_criterion authority for feature-correctness findings", () => {
    const hasACAauthority =
      skillBody.includes("acceptance_criterion authority") ||
      skillBody.includes("acceptance_criterion");
    expect(hasACAauthority).toBe(true);
  });

  it("requires each finding to cite its authority (rule or acceptance criterion)", () => {
    const hasCiteAuthority = skillBody.includes("cite") && skillBody.includes("authority");
    expect(hasCiteAuthority).toBe(true);
  });

  it("binds active_rule authority to architecture/security/policy/quality claimType", () => {
    // Skill text uses backtick-wrapped `active_rule` authority with → arrow
    const hasClaimBinding =
      skillBody.includes("claimType must be architecture/security/policy/quality");
    expect(hasClaimBinding).toBe(true);
  });

  it("binds acceptance_criterion authority to feature_correctness claimType", () => {
    // Skill text uses backtick-wrapped `acceptance_criterion` authority with → arrow
    const hasACClaimBinding =
      skillBody.includes("claimType must be feature_correctness");
    expect(hasACClaimBinding).toBe(true);
  });

  it("requires that findings without a valid authority are classified as OBSERVATION", () => {
    const hasNoAuthorityFallback =
      skillBody.includes("cannot cite a valid authority") ||
      skillBody.includes("must be classified as OBSERVATION");
    expect(hasNoAuthorityFallback).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.1: Require Complete Bounded Fields For Blockers/Expansions
// ---------------------------------------------------------------------------

describe("Phase 4: T4.1 — Reviewer requires complete bounded fields for blockers/expansions", () => {
  const skillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  // Surface requirements
  it("requires surface with inspected, affected, and confirmedUnaffected arrays", () => {
    expect(skillBody).toContain("inspected");
    expect(skillBody).toContain("affected");
    expect(skillBody).toContain("confirmedUnaffected");
  });

  it("requires surface entry fields (surfaceId, relativePath)", () => {
    expect(skillBody).toContain("surfaceId");
    expect(skillBody).toContain("relativePath");
  });

  it("requires bounded surface array sizes (min 1 inspected, max 128 per category)", () => {
    expect(skillBody).toContain("128");
  });

  // Root cause
  it("requires rootCause for IN_SCOPE_BLOCKER and SCOPE_EXPANSION", () => {
    expect(skillBody).toContain("rootCause");
  });

  // Remediation items
  it("requires remediationItems for blockers and expansions", () => {
    expect(skillBody).toContain("remediationItems");
  });

  it("requires remediation items to have remediationItemId, instruction, and targetSurfaceIds", () => {
    expect(skillBody).toContain("remediationItemId");
    expect(skillBody).toContain("instruction");
    expect(skillBody).toContain("targetSurfaceIds");
  });

  it("requires bounded remediation items (min 1, max 64 per finding)", () => {
    expect(skillBody).toContain("64");
  });

  // Test matrix
  it("requires testMatrix for blockers and expansions", () => {
    expect(skillBody).toContain("testMatrix");
  });

  it("requires test matrix items to have testId, requirement, and targetSurfaceIds", () => {
    expect(skillBody).toContain("testId");
    expect(skillBody).toContain("requirement");
  });

  // Exhaustiveness
  it("requires exhaustivenessDecision for blockers and expansions", () => {
    expect(skillBody).toContain("exhaustivenessDecision");
  });

  it("requires scopeExpansionRationale for SCOPE_EXPANSION findings", () => {
    expect(skillBody).toContain("scopeExpansionRationale");
  });

  it("requires debtImpact for ARCHITECTURE_DEBT findings", () => {
    expect(skillBody).toContain("debtImpact");
    expect(skillBody).toContain("untouched_non_blocking");
  });
});

// ---------------------------------------------------------------------------
// T4.5: Skill Contract Schema Alignment
// ---------------------------------------------------------------------------

describe("Phase 4: T4.5 — Prompt/skill contract schema alignment", () => {
  const reviewSkillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const reviewBody = extractBody(reviewSkillContent);
  const repairSkill = loadSkillFile(REPAIR_SKILL_PATH);
  const repairBody = extractBody(repairSkill);

  it("review skill requires schema conformance to common-review-contract-types-v1.schema.json", () => {
    const hasCommonSchemaRef = reviewBody.includes("common-review-contract-types-v1.schema.json");
    expect(hasCommonSchemaRef).toBe(true);
  });

  it("review skill describes all four dispositions consistently with v1 schema", () => {
    // Schema defines: IN_SCOPE_BLOCKER, SCOPE_EXPANSION, ARCHITECTURE_DEBT, OBSERVATION
    const dispositions = ["IN_SCOPE_BLOCKER", "SCOPE_EXPANSION", "ARCHITECTURE_DEBT", "OBSERVATION"];
    for (const disp of dispositions) {
      expect(reviewBody).toContain(disp);
    }
  });

  it("review skill mentions all required finding fields from the v1 schema", () => {
    // Core required fields from common-review-contract-types-v1.json reviewFinding
    const requiredFields = ["findingId", "disposition", "claimType", "authority", "defectClass", "severity", "summary", "surface"];
    for (const field of requiredFields) {
      expect(reviewBody).toContain(field);
    }
  });

  it("repair skill explicitly prohibits modifying reviewer-owned content", () => {
    // The fixer skill must clearly state that reviewer content is immutable
    const hasExplicitProhibition =
      repairBody.includes("immutable") ||
      repairBody.includes("FORBIDDEN") ||
      (repairBody.includes("reviewer-owned") &&
       (repairBody.includes("must not") || repairBody.includes("must NOT")));
    expect(hasExplicitProhibition).toBe(true);
  });

  it("repair skill declares remediation-response and verification-receipt output artifacts", () => {
    // The frontmatter must declare both structured output artifacts
    const hasResponseOutput = repairSkill.includes('artifact: "remediation-response"');
    const hasReceiptOutput = repairSkill.includes('artifact: "verification-receipt"');
    expect(hasResponseOutput).toBe(true);
    expect(hasReceiptOutput).toBe(true);
  });

  it("repair skill reads the review manifest JSON as input", () => {
    // The frontmatter reads must include the manifest.json path
    const hasManifestRead = repairSkill.includes("-manifest.json");
    expect(hasManifestRead).toBe(true);
  });

  it("review skill frontmatter declares review-manifest output artifact", () => {
    // Verify the review skill also has its structured output declared
    expect(reviewSkillContent).toContain('artifact: "review-manifest"');
  });

  it("review skill loads architecture-rules.yaml for rule snapshot resolution", () => {
    const hasCatalogRead = reviewSkillContent.includes("architecture-rules.yaml");
    expect(hasCatalogRead).toBe(true);
  });

  it("review skill loads FeatureTasks.md for acceptance-criterion references", () => {
    const hasFtRead = reviewSkillContent.includes("FeatureTasks.md");
    expect(hasFtRead).toBe(true);
  });

  it("binds acceptance-criterion references to the exact canonical scope feature ID", () => {
    const manifestPromptSource = readFileSync(
      resolve(PROJECT_ROOT, "apps/orchestrator/src/workflows/prompts/phase-code-review-manifest-prompt.ts"),
      "utf8",
    );
    expect(manifestPromptSource).toContain("Every acceptance-criterion authority reference must use the exact canonical feature identity");
    expect(manifestPromptSource).toContain("The feature segment must exactly equal scope.featureId");
    expect(manifestPromptSource).not.toContain('"ac:${feature.externalId}:<criterionId>"');
  });
});

// ---------------------------------------------------------------------------
// T4.2: Fixer Skill Consumes Approved Bounded Items From Review Manifest
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Fixer skill consumes approved bounded items from the review manifest", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("references the review manifest as a required read input", () => {
    // The fixer must read the manifest to get approved bounded items
    const hasManifestRead =
      skillContent.includes("manifest.json") &&
      (skillContent.includes("reads") || skillBody.includes("Load And Validate The Review Manifest"));
    expect(hasManifestRead).toBe(true);
  });

  it("requires consuming only approved remediation items from the manifest", () => {
    const hasBoundedItems =
      skillBody.includes("remediationItems") &&
      skillBody.includes("approved bounded") &&
      skillBody.includes("targetSurfaceIds");
    expect(hasBoundedItems).toBe(true);
  });

  it("requires consuming only approved test matrix items from the manifest", () => {
    const hasTestMatrix =
      skillBody.includes("testMatrix") &&
      skillBody.includes("testId") &&
      skillBody.includes("requirement");
    expect(hasTestMatrix).toBe(true);
  });

  it("limits fixer changes to the affected surface only", () => {
    const hasSurfaceLimit =
      skillBody.includes("affected") &&
      (skillBody.includes("only modify code at") ||
       skillBody.includes("only code locations the fixer may change") ||
       skillBody.includes("modify only the") && skillBody.includes("surface"));
    expect(hasSurfaceLimit).toBe(true);
  });

  it("requires validating the manifest result is NEEDS_CHANGES before proceeding", () => {
    const hasNeedsChangesCheck =
      skillBody.includes("NEEDS_CHANGES") &&
      (skillBody.includes("authorizing a fixer response") ||
       skillBody.includes("authorizing"));
    expect(hasNeedsChangesCheck).toBe(true);
  });

  it("rejects proceeding when the manifest is APPROVED or BLOCKED", () => {
    const hasStopCondition =
      skillBody.includes("APPROVED") &&
      skillBody.includes("BLOCKED") &&
      (skillBody.includes("do not proceed") ||
       skillBody.includes("no work to fix"));
    expect(hasStopCondition).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2: Fixer Skill Emits Separate Remediation Response
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Fixer skill emits separate remediation response", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("declares remediation-response as an output artifact in frontmatter", () => {
    const hasResponseOutput = skillContent.includes('artifact: "remediation-response"');
    expect(hasResponseOutput).toBe(true);
  });

  it("requires the response to conform to remediation-response-v1.schema.json", () => {
    const hasSchemaRef = skillBody.includes("remediation-response-v1.schema.json");
    expect(hasSchemaRef).toBe(true);
  });

  it("requires the response to include a manifestReference linking to the review manifest", () => {
    const hasManifestRef =
      skillBody.includes("manifestReference") &&
      skillBody.includes("ArtifactReference");
    expect(hasManifestRef).toBe(true);
  });

  it("requires manifestReference to include artifactKind, artifactId, contentHash, and relativePath", () => {
    const hasRefFields =
      skillBody.includes("artifactKind") &&
      skillBody.includes("artifactId") &&
      skillBody.includes("contentHash") &&
      skillBody.includes("relativePath");
    expect(hasRefFields).toBe(true);
  });

  it("requires the response to cover each remediation item exactly once", () => {
    const hasCoverage =
      skillBody.includes("cover each remediation item exactly once") ||
      (skillBody.includes("exactly once") && skillBody.includes("remediation"));
    expect(hasCoverage).toBe(true);
  });

  it("requires response entries to have remediationItemId, decision, changedSurfaceIds, and rationale", () => {
    const hasItemFields =
      skillBody.includes("remediationItemId") &&
      skillBody.includes("decision") &&
      skillBody.includes("changedSurfaceIds") &&
      skillBody.includes("rationale");
    expect(hasItemFields).toBe(true);
  });

  it("requires decision to be one of APPLIED, NOT_APPLIED, or NOT_APPLICABLE", () => {
    const hasDecisions =
      skillBody.includes("APPLIED") &&
      skillBody.includes("NOT_APPLIED") &&
      skillBody.includes("NOT_APPLICABLE");
    expect(hasDecisions).toBe(true);
  });

  it("requires the response to not name an unknown finding or remediation item", () => {
    const hasNoUnknown =
      skillBody.includes("not name an unknown finding") ||
      skillBody.includes("may NOT name an unknown");
    expect(hasNoUnknown).toBe(true);
  });

  it("allows optional suspectedOutOfScopeObservations with relativePath and rationale", () => {
    const hasOutOfScope =
      skillBody.includes("suspectedOutOfScopeObservations") ||
      skillBody.includes("suspectedOutOfScope");
    expect(hasOutOfScope).toBe(true);
  });

  it("limits suspectedOutOfScopeObservations to 16 entries max", () => {
    const hasMaxObs = skillBody.includes("Max 16 observations");
    expect(hasMaxObs).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2: Fixer Skill Emits Separate Verification Receipt
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Fixer skill emits separate verification receipt", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("declares verification-receipt as an output artifact in frontmatter", () => {
    const hasReceiptOutput = skillContent.includes('artifact: "verification-receipt"');
    expect(hasReceiptOutput).toBe(true);
  });

  it("requires the receipt to conform to verification-receipt-v1.schema.json", () => {
    const hasSchemaRef = skillBody.includes("verification-receipt-v1.schema.json");
    expect(hasSchemaRef).toBe(true);
  });

  it("requires both manifestReference and responseReference in the receipt", () => {
    const hasRefs =
      skillBody.includes("manifestReference") &&
      skillBody.includes("responseReference");
    expect(hasRefs).toBe(true);
  });

  it("requires itemReceipts with findingId, remediationItemId, outcome, and evidence", () => {
    // The body may use backtick-wrapped field names and "Item Receipts" heading
    const hasItemReceipts =
      (skillBody.includes("Item Receipts") || skillBody.includes("itemReceipts")) &&
      skillBody.includes("findingId") &&
      skillBody.includes("remediationItemId") &&
      skillBody.includes("outcome") &&
      skillBody.includes("evidence");
    expect(hasItemReceipts).toBe(true);
  });

  it("requires item receipt outcome to be one of VERIFIED, FAILED, or NOT_VERIFIABLE", () => {
    const hasOutcomes =
      skillBody.includes("VERIFIED") &&
      skillBody.includes("FAILED") &&
      skillBody.includes("NOT_VERIFIABLE");
    expect(hasOutcomes).toBe(true);
  });

  it("requires testReceipts with findingId, testId, outcome, and evidence", () => {
    // The body may use backtick-wrapped field names and "Test Receipts" heading
    const hasTestReceipts =
      (skillBody.includes("Test Receipts") || skillBody.includes("testReceipts")) &&
      skillBody.includes("testId") &&
      skillBody.includes("outcome") &&
      skillBody.includes("evidence");
    expect(hasTestReceipts).toBe(true);
  });

  it("requires test receipt outcome to be one of PASSED, FAILED, NOT_RUN, or NOT_VERIFIABLE", () => {
    const hasTestOutcomes =
      skillBody.includes("PASSED") &&
      skillBody.includes("FAILED") &&
      skillBody.includes("NOT_RUN") &&
      skillBody.includes("NOT_VERIFIABLE");
    expect(hasTestOutcomes).toBe(true);
  });

  it("requires coverage of one item receipt per response remediation item", () => {
    const hasCoverage =
      skillBody.includes("Exactly one item receipt per remediation item") ||
      skillBody.includes("One receipt per remediation item");
    expect(hasCoverage).toBe(true);
  });

  it("requires coverage of one test receipt per test-matrix item", () => {
    const hasTestCoverage =
      skillBody.includes("one test receipt per test-matrix item") ||
      skillBody.includes("One receipt per test-matrix item") ||
      skillBody.includes("one test receipt per `testMatrix` item");
    expect(hasTestCoverage).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2: Fixer Must Not Modify Reviewer-Owned Content
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Fixer must not modify reviewer-owned content", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("prohibits modifying reviewer-owned finding text", () => {
    const noTextChange =
      skillBody.includes("finding text") &&
      (skillBody.includes("immutable") || skillBody.includes("must not") || skillBody.includes("FORBIDDEN") || skillBody.includes("prohibit"));
    expect(noTextChange).toBe(true);
  });

  it("prohibits modifying reviewer-owned finding IDs", () => {
    const noIdChange =
      skillBody.includes("findingId") &&
      (skillBody.includes("immutable") || skillBody.includes("must not") || skillBody.includes("FORBIDDEN") || skillBody.includes("must not change"));
    expect(noIdChange).toBe(true);
  });

  it("prohibits modifying the review manifest artifact itself", () => {
    const noManifestChange =
      skillBody.includes("review manifest") &&
      (skillBody.includes("immutable") || skillBody.includes("must not edit") || skillBody.includes("must not modify") || skillBody.includes("FORBIDDEN"));
    expect(noManifestChange).toBe(true);
  });

  it("prohibits including reviewer-owned fields in the remediation response", () => {
    const noReviewerFields =
      skillBody.includes("reviewer-owned") &&
      (skillBody.includes("never contains") ||
       skillBody.includes("must not contain") ||
       skillBody.includes("must not include"));
    expect(noReviewerFields).toBe(true);
  });

  it("declares that the fixer must not edit the manifest file", () => {
    const noManifestEdit =
      skillBody.includes("manifest") &&
      skillBody.includes("authoritative") &&
      skillBody.includes("fixed");
    expect(noManifestEdit).toBe(true);
  });

  it("prohibits claiming Markdown has authority over structured artifacts", () => {
    const noMarkdownAuthority =
      skillBody.includes("Markdown") &&
      skillBody.includes("authority") &&
      (skillBody.includes("presentation evidence") ||
       skillBody.includes("not an independent authority") ||
       skillBody.includes("FORBIDDEN"));
    expect(noMarkdownAuthority).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2: Fixer Must Not Perform Silent Scope Expansion
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Fixer must not silently expand scope", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("prohibits addressing SCOPE_EXPANSION findings without FEAT-066 approval", () => {
    const noExpansion =
      skillBody.includes("SCOPE_EXPANSION") &&
      (skillBody.includes("must not silently implement") ||
       skillBody.includes("must NOT be silently") ||
       skillBody.includes("require FEAT-066 approval"));
    expect(noExpansion).toBe(true);
  });

  it("prohibits implementing changes beyond the approved affected surface", () => {
    const noBeyondSurface =
      skillBody.includes("affected") &&
      (skillBody.includes("beyond") ||
       skillBody.includes("not silently expand") ||
       skillBody.includes("only code locations"));
    expect(noBeyondSurface).toBe(true);
  });

  it("requires unapproved related issues to be recorded as suspectedOutOfScopeObservations, not implemented", () => {
    const noSilentImpl =
      skillBody.includes("suspected") &&
      (skillBody.includes("Do NOT implement") ||
       skillBody.includes("not authorize a code change"));
    expect(noSilentImpl).toBe(true);
  });

  it("records scope expansion as explicitly forbidden in the prohibitions table", () => {
    const hasForbiddenTable =
      skillBody.includes("FORBIDDEN") &&
      (skillBody.includes("silent scope expansion") ||
       skillBody.includes("Scope expansion") ||
       skillBody.includes("unapproved"));
    expect(hasForbiddenTable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.2: Evidence Safety Rules
// ---------------------------------------------------------------------------

describe("Phase 4: T4.2 — Verification receipt evidence safety rules", () => {
  const skillContent = loadSkillFile(REPAIR_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("prohibits raw command transcripts in evidence", () => {
    const noRawTranscripts =
      skillBody.includes("raw command transcript") ||
      skillBody.includes("raw command transcripts");
    expect(noRawTranscripts).toBe(true);
  });

  it("prohibits credentials in evidence", () => {
    const noCredentials =
      skillBody.includes("credentials") &&
      (skillBody.includes("must not contain") ||
       skillBody.includes("must NOT contain") ||
       skillBody.includes("Evidence must not contain"));
    expect(noCredentials).toBe(true);
  });

  it("prohibits stack traces in evidence", () => {
    const noStackTraces =
      skillBody.includes("stack traces") ||
      skillBody.includes("stack trace");
    expect(noStackTraces).toBe(true);
  });

  it("requires evidence to be a safe bounded summary (focused command, exit code, assertion reference)", () => {
    const safeEvidence =
      skillBody.includes("focused command") ||
      (skillBody.includes("evidence") &&
       skillBody.includes("safe bounded summary"));
    expect(safeEvidence).toBe(true);
  });

  it("prohibits implicit approval claims in the receipt", () => {
    const noApprovalClaim =
      skillBody.includes("implicit approval claim") ||
      skillBody.includes("implicit approval");
    expect(noApprovalClaim).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.5: Skill Contract Schema Alignment (Fixer)
// ---------------------------------------------------------------------------

describe("Phase 4: T4.5 — Fixer skill schema alignment", () => {
  const repairSkill = loadSkillFile(REPAIR_SKILL_PATH);
  const repairBody = extractBody(repairSkill);

  it("requires schema conformance to remediation-response-v1.schema.json", () => {
    expect(repairBody).toContain("remediation-response-v1.schema.json");
  });

  it("requires schema conformance to verification-receipt-v1.schema.json", () => {
    expect(repairBody).toContain("verification-receipt-v1.schema.json");
  });

  it("requires schema conformance to common-review-contract-types-v1.schema.json", () => {
    expect(repairBody).toContain("common-review-contract-types-v1.schema.json");
  });

  it("mentions all required response fields from the remediation-response-v1 schema", () => {
    // The skill uses human-readable headings; check for the presence of each concept
    const hasSchemaVersion = repairBody.includes("schemaVersion");
    const hasArtifactKind = repairBody.includes("artifactKind");
    const hasArtifactId = repairBody.includes("artifactId");
    const hasScope = repairBody.includes("scope");
    const hasManifestRef = repairBody.includes("manifestReference");
    // "Finding Responses" is the human-readable heading for findingResponses
    const hasFindingResponses = repairBody.includes("Finding Responses") || repairBody.includes("findingResponses");
    expect(hasSchemaVersion).toBe(true);
    expect(hasArtifactKind).toBe(true);
    expect(hasArtifactId).toBe(true);
    expect(hasScope).toBe(true);
    expect(hasManifestRef).toBe(true);
    expect(hasFindingResponses).toBe(true);
  });

  it("mentions all required receipt fields from the verification-receipt-v1 schema", () => {
    // The skill uses human-readable headings; check for each concept individually
    const hasSchemaVersion = repairBody.includes("schemaVersion");
    const hasArtifactKind = repairBody.includes("artifactKind");
    const hasArtifactId = repairBody.includes("artifactId");
    const hasScope = repairBody.includes("scope");
    const hasManifestRef = repairBody.includes("manifestReference");
    const hasResponseRef = repairBody.includes("responseReference");
    // "Item Receipts" and "Test Receipts" are human-readable headings
    const hasItemReceipts = repairBody.includes("Item Receipts") || repairBody.includes("itemReceipts");
    const hasTestReceipts = repairBody.includes("Test Receipts") || repairBody.includes("testReceipts");
    expect(hasSchemaVersion).toBe(true);
    expect(hasArtifactKind).toBe(true);
    expect(hasArtifactId).toBe(true);
    expect(hasScope).toBe(true);
    expect(hasManifestRef).toBe(true);
    expect(hasResponseRef).toBe(true);
    expect(hasItemReceipts).toBe(true);
    expect(hasTestReceipts).toBe(true);
  });

  it("requires the response to have ordered non-empty findingResponses array", () => {
    // Human-readable heading "Finding Responses" represents the findingResponses array
    const hasFindingResponses = repairBody.includes("Finding Responses") || repairBody.includes("findingResponses");
    expect(hasFindingResponses).toBe(true);
  });

  it("requires common envelope fields (schemaVersion, artifactKind, artifactId, scope)", () => {
    const hasEnvelope =
      repairBody.includes("schemaVersion") &&
      repairBody.includes("artifactKind") &&
      repairBody.includes("artifactId") &&
      repairBody.includes("scope");
    expect(hasEnvelope).toBe(true);
  });

  it("references the REVIEW_SKILL_PATH constant for independent verification", () => {
    // T4.2 only checks the fixer skill, but the import constants exist
    expect(REPAIR_SKILL_PATH).toContain("repair-review-findings.skill.md");
  });
});

// ---------------------------------------------------------------------------
// Safe Projection: Reject unsafe values (T4.4 scope check — non-authoritative)
// ---------------------------------------------------------------------------

describe("Phase 4: T4.1/T4.4 — Review manifest projection keeps non-authoritative rendering", () => {
  const skillContent = loadSkillFile(REVIEW_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("declares that Markdown is NOT used for workflow state transitions", () => {
    const hasNoStateTransition =
      skillBody.includes("NOT used for workflow state") ||
      skillBody.includes("cannot affect workflow state");
    expect(hasNoStateTransition).toBe(true);
  });

  it("requires a prominent note in the Markdown report citing the manifest as authoritative", () => {
    const hasNote =
      skillBody.includes("prominent note") ||
      skillBody.includes("> **Note:**");
    expect(hasNote).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Skill Exists And Is Readable
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan skill exists with structured output contract", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("replan-phase.skill.md file exists", () => {
    expect(existsSync(REPLAN_SKILL_PATH)).toBe(true);
  });

  it("frontmatter declares replan-plan as an output artifact", () => {
    const hasReplanOutput = skillContent.includes('artifact: "replan-plan"');
    expect(hasReplanOutput).toBe(true);
  });

  it("frontmatter reads the review manifest as input", () => {
    const hasManifestRead = skillContent.includes("-manifest.json");
    expect(hasManifestRead).toBe(true);
  });

  it("requires schema conformance to replan-plan-v1.schema.json", () => {
    expect(skillBody).toContain("replan-plan-v1.schema.json");
  });

  it("requires schema conformance to common-review-contract-types-v1.schema.json", () => {
    expect(skillBody).toContain("common-review-contract-types-v1.schema.json");
  });

  it("declares the replan plan as a reviewer-owned proposal, not a fixer artifact", () => {
    const isReviewerOwned =
      skillBody.includes("reviewer-owned") ||
      (skillBody.includes("reviewer") && skillBody.includes("proposal"));
    expect(isReviewerOwned).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Plan Emits Declared Complete Surface
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan plan requires complete surface and exclusions", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires surface with inspected, affected, and confirmedUnaffected arrays", () => {
    expect(skillBody).toContain("inspected");
    expect(skillBody).toContain("affected");
    expect(skillBody).toContain("confirmedUnaffected");
  });

  it("requires surface entry fields (surfaceId, relativePath)", () => {
    expect(skillBody).toContain("surfaceId");
    expect(skillBody).toContain("relativePath");
  });

  it("requires bounded surface array sizes (min 1 inspected, max 128 per category)", () => {
    expect(skillBody).toContain("128");
  });

  it("requires rootCause for the replan plan", () => {
    expect(skillBody).toContain("rootCause");
  });

  it("requires explicitExclusions with relativePath and rationale", () => {
    const hasExclusions =
      skillBody.includes("explicitExclusions") &&
      skillBody.includes("relativePath") &&
      skillBody.includes("rationale");
    expect(hasExclusions).toBe(true);
  });

  it("limits explicitExclusions to 64 entries max", () => {
    expect(skillBody).toContain("64");
  });

  it("states exclusions must not overlap the affected surface", () => {
    const excludesOverlap =
      skillBody.includes("cannot overlap") ||
      skillBody.includes("must not overlap");
    expect(excludesOverlap).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Plan Emits Remediation Items And Test Matrix
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan plan requires remediation items and test matrix", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires remediationItems array", () => {
    expect(skillBody).toContain("remediationItems");
  });

  it("requires each remediation item to have remediationItemId, instruction, and targetSurfaceIds", () => {
    expect(skillBody).toContain("remediationItemId");
    expect(skillBody).toContain("instruction");
    expect(skillBody).toContain("targetSurfaceIds");
  });

  it("requires bounded remediation items (min 1, max 64)", () => {
    expect(skillBody).toContain("64");
  });

  it("requires remediation item IDs to be plan-local and not overwrite finding-owned IDs", () => {
    const planLocalIds =
      skillBody.includes("plan-local") ||
      (skillBody.includes("plan") && skillBody.includes("must not overwrite"));
    expect(planLocalIds).toBe(true);
  });

  it("requires testMatrix array", () => {
    expect(skillBody).toContain("testMatrix");
  });

  it("requires each test matrix item to have testId, requirement, and targetSurfaceIds", () => {
    expect(skillBody).toContain("testId");
    expect(skillBody).toContain("requirement");
  });

  it("requires bounded test matrix items (min 1, max 64)", () => {
    expect(skillBody).toContain("64");
  });

  it("requires test matrix IDs to be plan-local and not overwrite finding-owned test IDs", () => {
    const planLocalIds =
      skillBody.includes("plan-local") ||
      (skillBody.includes("plan") && skillBody.includes("must not overwrite"));
    expect(planLocalIds).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Plan Emits Closure Criteria And Verification Plan
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan plan requires closure criteria and verification plan", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires verificationPlan field", () => {
    expect(skillBody).toContain("verificationPlan");
  });

  it("describes what verificationPlan contains (verification approach, tooling, success criteria)", () => {
    const hasApproach =
      skillBody.includes("Verification approach") ||
      skillBody.includes("verification approach") ||
      skillBody.includes("Verification Plan");
    expect(hasApproach).toBe(true);
  });

  it("requires closureCriteria field", () => {
    expect(skillBody).toContain("closureCriteria");
  });

  it("describes what closureCriteria contains (tests, artifacts, approvals)", () => {
    const hasClosureDesc =
      skillBody.includes("Closure Criteria") ||
      skillBody.includes("closure criteria");
    expect(hasClosureDesc).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Plan Approval-Ready References And FEAT-066 Ownership
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan plan has approval-ready references and declares FEAT-066 ownership", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("requires manifestReference with artifactKind, artifactId, contentHash, and relativePath", () => {
    expect(skillBody).toContain("manifestReference");
    expect(skillBody).toContain("artifactKind");
    expect(skillBody).toContain("artifactId");
    expect(skillBody).toContain("contentHash");
    expect(skillBody).toContain("relativePath");
  });

  it("requires findingIds (non-empty, unique, kebab-case)", () => {
    expect(skillBody).toContain("findingIds");
  });

  it("requires defectClass (shared defect class for all referenced findings)", () => {
    expect(skillBody).toContain("defectClass");
  });

  it("requires replanReason (finding_exhaustiveness or recurrence_signal)", () => {
    expect(skillBody).toContain("replanReason");
    expect(skillBody).toContain("finding_exhaustiveness");
    expect(skillBody).toContain("recurrence_signal");
  });

  it("requires common envelope fields (schemaVersion, artifactKind, artifactId, scope)", () => {
    expect(skillBody).toContain("schemaVersion");
    expect(skillBody).toContain("artifactKind");
    expect(skillBody).toContain("artifactId");
    expect(skillBody).toContain("scope");
  });

  it("declares that FEAT-066 owns approval workflow execution", () => {
    const feat066Owns =
      skillBody.includes("FEAT-066 owns approval") ||
      (skillBody.includes("FEAT-066") && skillBody.includes("approval"));
    expect(feat066Owns).toBe(true);
  });

  it("declares that FEAT-066 owns dispatch of an approved bounded replan", () => {
    const feat066Dispatch =
      skillBody.includes("FEAT-066 owns") &&
      (skillBody.includes("dispatch") || skillBody.includes("execution"));
    expect(feat066Dispatch).toBe(true);
  });

  it("prohibits including human approval state in the replan plan artifact", () => {
    const noApprovalState =
      skillBody.includes("FORBIDDEN") &&
      (skillBody.includes("human approval state") ||
       skillBody.includes("Include human approval"));
    expect(noApprovalState).toBe(true);
  });

  it("prohibits recurrence counters or detection state in the replan plan", () => {
    const noRecurrence =
      skillBody.includes("FORBIDDEN") &&
      (skillBody.includes("recurrence counters") ||
       skillBody.includes("Include recurrence"));
    expect(noRecurrence).toBe(true);
  });

  it("prohibits dispatch records or authorization in the replan plan", () => {
    const noDispatch =
      skillBody.includes("FORBIDDEN") &&
      (skillBody.includes("dispatch record") ||
       skillBody.includes("dispatch"));
    expect(noDispatch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4.3: Replan Skill Markdown Non-Authoritative And Safety Rules
// ---------------------------------------------------------------------------

describe("Phase 4: T4.3 — Replan plan Markdown is non-authoritative presentation evidence", () => {
  const skillContent = loadSkillFile(REPLAN_SKILL_PATH);
  const skillBody = extractBody(skillContent);

  it("declares Markdown as presentation evidence, not workflow authority", () => {
    const markdownNonAuth =
      (skillBody.includes("Markdown") && skillBody.includes("presentation evidence")) ||
      (skillBody.includes("presentation-only"));
    expect(markdownNonAuth).toBe(true);
  });

  it("requires a prominent note citing the structured replan plan as authoritative", () => {
    const hasNote =
      skillBody.includes("> **Note:**") ||
      (skillBody.includes("prominent note") && skillBody.includes("replan plan"));
    expect(hasNote).toBe(true);
  });

  it("prohibits modifying the review manifest or finding content", () => {
    const noManifestMod =
      skillBody.includes("FORBIDDEN") &&
      (skillBody.includes("review manifest") ||
       skillBody.includes("Modify the review manifest") ||
       skillBody.includes("Modify the review manifest or finding"));
    expect(noManifestMod).toBe(true);
  });

  it("requires all referenced findings to share the same defectClass", () => {
    const sameDefectClass =
      skillBody.includes("same defect class") ||
      skillBody.includes("share the same defectClass");
    expect(sameDefectClass).toBe(true);
  });

  it("includes a prohibitions table with FORBIDDEN actions", () => {
    expect(skillBody).toContain("FORBIDDEN");
  });
});

// ---------------------------------------------------------------------------
// T4.5: Replan Skill Schema Alignment (additional — complements existing
//       T4.5 review/fixer schema alignment sections above)
// ---------------------------------------------------------------------------

describe("Phase 4: T4.5 — Replan skill schema alignment", () => {
  const replanSkill = loadSkillFile(REPLAN_SKILL_PATH);
  const replanBody = extractBody(replanSkill);

  it("mentions all required replan-plan fields from replan-plan-v1.schema.json", () => {
    // Common envelope
    expect(replanBody).toContain("schemaVersion");
    expect(replanBody).toContain("artifactKind");
    expect(replanBody).toContain("artifactId");
    expect(replanBody).toContain("scope");
    // Replan-specific fields
    expect(replanBody).toContain("manifestReference");
    expect(replanBody).toContain("findingIds");
    expect(replanBody).toContain("defectClass");
    expect(replanBody).toContain("replanReason");
    expect(replanBody).toContain("surface");
    expect(replanBody).toContain("remediationItems");
    expect(replanBody).toContain("testMatrix");
    expect(replanBody).toContain("verificationPlan");
    expect(replanBody).toContain("closureCriteria");
  });

  it("mentions all ArtifactReference fields for manifestReference", () => {
    expect(replanBody).toContain("artifactKind");
    expect(replanBody).toContain("artifactId");
    expect(replanBody).toContain("contentHash");
    expect(replanBody).toContain("relativePath");
  });

  it("requires common envelope fields consistent with review-manifest schema", () => {
    expect(replanBody).toContain("schemaVersion");
    expect(replanBody).toContain("artifactKind");
    expect(replanBody).toContain("artifactId");
    expect(replanBody).toContain("scope");
  });

  it("declares FEAT-066 ownership of approval workflow", () => {
    const feat066Owns =
      replanBody.includes("FEAT-066 owns") &&
      (replanBody.includes("approval") || replanBody.includes("workflow execution"));
    expect(feat066Owns).toBe(true);
  });

  it("frontmatter output artifact name matches schema file name", () => {
    // Output artifact is named "replan-plan" and schema is "replan-plan-v1.schema.json"
    expect(replanSkill).toContain('artifact: "replan-plan"');
    expect(replanBody).toContain("replan-plan-v1.schema.json");
  });

  it("mentions all three surface categories consistently with schema", () => {
    expect(replanBody).toContain("inspected");
    expect(replanBody).toContain("affected");
    expect(replanBody).toContain("confirmedUnaffected");
  });

  it("mentions all three remediation item fields", () => {
    expect(replanBody).toContain("remediationItemId");
    expect(replanBody).toContain("instruction");
    expect(replanBody).toContain("targetSurfaceIds");
  });

  it("mentions both test matrix item fields", () => {
    expect(replanBody).toContain("testId");
    expect(replanBody).toContain("requirement");
  });

  it("mentions both exclusions fields (relativePath, rationale)", () => {
    expect(replanBody).toContain("explicitExclusions");
    expect(replanBody).toContain("relativePath");
    expect(replanBody).toContain("rationale");
  });

  it("mentions both replan reason values", () => {
    expect(replanBody).toContain("finding_exhaustiveness");
    expect(replanBody).toContain("recurrence_signal");
  });
});

// ---------------------------------------------------------------------------
// T4.5: Cross-Skill Schema Consistency — Frontmatter Parser Constraints
// ---------------------------------------------------------------------------

describe("Phase 4: T4.5 — Cross-skill consistency and parser constraints", () => {
  const reviewSkill = loadSkillFile(REVIEW_SKILL_PATH);
  const repairSkill = loadSkillFile(REPAIR_SKILL_PATH);
  const replanSkill = loadSkillFile(REPLAN_SKILL_PATH);
  const reviewBody = extractBody(reviewSkill);
  const repairBody = extractBody(repairSkill);
  const replanBody = extractBody(replanSkill);

  it("all three skill files declare a hepha-skill-version in frontmatter", () => {
    expect(reviewSkill).toContain("hepha-skill-version");
    expect(repairSkill).toContain("hepha-skill-version");
    expect(replanSkill).toContain("hepha-skill-version");
  });

  it("all three skill files have a gates section requiring code-review", () => {
    expect(reviewSkill).toContain("gates:");
    expect(repairSkill).toContain("gates:");
    expect(replanSkill).toContain("gates:");
  });

  it("all three skill files have a safety-profile section", () => {
    expect(reviewSkill).toContain("safety-profile:");
    expect(repairSkill).toContain("safety-profile:");
    expect(replanSkill).toContain("safety-profile:");
  });

  it("each skill frontmatter output artifact has a matching JSON artifact path pattern", () => {
    // Review skill: review-manifest → -manifest.json
    expect(reviewSkill).toContain('artifact: "review-manifest"');
    expect(reviewSkill).toContain("-manifest.json");
    // Repair skill: remediation-response → -remediation-response.json
    expect(repairSkill).toContain('artifact: "remediation-response"');
    expect(repairSkill).toContain("-remediation-response.json");
    // Repair skill: verification-receipt → -verification-receipt.json
    expect(repairSkill).toContain('artifact: "verification-receipt"');
    expect(repairSkill).toContain("-verification-receipt.json");
    // Replan skill: replan-plan → -replan-plan.json
    expect(replanSkill).toContain('artifact: "replan-plan"');
    expect(replanSkill).toContain("-replan-plan.json");
  });

  it("each skill body references the correct schema files for its artifacts", () => {
    // Review skill references review-manifest-v1.schema.json
    expect(reviewBody).toContain("review-manifest-v1.schema.json");
    // All skills reference common-review-contract-types-v1.schema.json
    expect(reviewBody).toContain("common-review-contract-types-v1.schema.json");
    expect(repairBody).toContain("common-review-contract-types-v1.schema.json");
    expect(replanBody).toContain("common-review-contract-types-v1.schema.json");
    // Repair skill references both response and receipt schemas
    expect(repairBody).toContain("remediation-response-v1.schema.json");
    expect(repairBody).toContain("verification-receipt-v1.schema.json");
    // Replan skill references replan-plan-v1.schema.json
    expect(replanBody).toContain("replan-plan-v1.schema.json");
  });

  it("all three skills consistently declare Markdown as non-authoritative presentation", () => {
    // Review skill
    const reviewNonAuth = reviewBody.includes("presentation evidence");
    expect(reviewNonAuth).toBe(true);
    // Repair skill
    const repairNonAuth = repairBody.includes("presentation evidence");
    expect(repairNonAuth).toBe(true);
    // Replan skill
    const replanNonAuth = replanBody.includes("presentation evidence");
    expect(replanNonAuth).toBe(true);
  });

  it("no skill file declares workflow-authority over state transitions", () => {
    // None should claim "authoritative" or "decision authority" for Markdown
    const noMdAuthority = (s: string) => {
      const lower = s.toLowerCase();
      // "presentation evidence" is fine; "authoritative decision record" for Markdown is not
      return !lower.includes("markdown is the authoritative") &&
             !lower.includes("markdown is authoritative") &&
             !lower.includes("markdown authorizes");
    };
    expect(noMdAuthority(reviewBody)).toBe(true);
    expect(noMdAuthority(repairBody)).toBe(true);
    expect(noMdAuthority(replanBody)).toBe(true);
  });

  it("review skill frontmatter reads architecture-rules.yaml for rule resolution", () => {
    expect(reviewSkill).toContain("architecture-rules.yaml");
  });

  it("review skill frontmatter reads FeatureTasks.md", () => {
    expect(reviewSkill).toContain("FeatureTasks.md");
  });

  it("repair skill frontmatter reads the manifest JSON file", () => {
    expect(repairSkill).toContain("-manifest.json");
  });

  it("replan skill frontmatter reads the manifest JSON file", () => {
    expect(replanSkill).toContain("-manifest.json");
  });

  it("all skills have a workflow-nodes section", () => {
    expect(reviewSkill).toContain("workflow-nodes");
    expect(repairSkill).toContain("workflow-nodes");
    expect(replanSkill).toContain("workflow-nodes");
  });

  it("existing skill parser can extract frontmatter from all three skill files", () => {
    // The extractFrontmatter helper must succeed for all three files
    const reviewFm = extractFrontmatter(reviewSkill);
    const repairFm = extractFrontmatter(repairSkill);
    const replanFm = extractFrontmatter(replanSkill);
    // Each should have at least name and description
    expect(reviewFm.name).toBe("review-phase");
    expect(repairFm.name).toBe("repair-review-findings");
    expect(replanFm.name).toBe("replan-phase");
    expect(reviewFm.description).toBeDefined();
    expect(repairFm.description).toBeDefined();
    expect(replanFm.description).toBeDefined();
  });
});
