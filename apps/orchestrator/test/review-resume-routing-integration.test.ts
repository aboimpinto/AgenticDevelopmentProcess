import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { selectReviewResumeRoute } from "../src/review-resume-route-policy.js";
import {
  assertReviewRemediationSuccessorHandoffBindings,
  parseReviewRemediationSuccessorHandoff,
  REMEDIATION_RESPONSE_HASH_PLACEHOLDER,
  REMEDIATION_RESPONSE_PATH_PLACEHOLDER,
  resolveReviewRemediationSuccessorIdentityLease,
} from "../src/review-remediation-successor-handoff.js";

const featurePath = fileURLToPath(new URL("./review-resume-routing.feature", import.meta.url));
const orchestratorPath = fileURLToPath(new URL("../src/workflows/implementation/autonomous-implementation-workflow-application.ts", import.meta.url));
const plannerPath = fileURLToPath(new URL("../src/workflows/phases/phase-review-resume-planner.ts", import.meta.url));
const reviewStatePath = fileURLToPath(new URL("../src/workflows/reviews/phase-review-state-application.ts", import.meta.url));
const executionPlanningPath = fileURLToPath(new URL("../src/workflows/phases/phase-execution-planning-application.ts", import.meta.url));
const publicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-review-publication-application.ts", import.meta.url));
const remediationSuccessorApplicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-remediation-successor-application.ts", import.meta.url));
const remediationSuccessorPublicationPath = fileURLToPath(new URL("../src/workflows/reviews/phase-remediation-successor-publication-application.ts", import.meta.url));
const workerExecutionApplicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-execution-application.ts", import.meta.url));
const workerResultApplicationPath = fileURLToPath(new URL("../src/workflows/phases/phase-worker-result-application.ts", import.meta.url));
const integrationPath = fileURLToPath(new URL("../src/authoritative-review-integration.ts", import.meta.url));
const handoffPath = fileURLToPath(new URL("../src/review-remediation-successor-handoff.ts", import.meta.url));

const ready = {
  reviewRequired: true,
  workReadyForReview: true,
  latestReportHasFindings: true,
  awaitingBaselineReview: false,
  awaitingIndependentRerun: false,
} as const;

describe("generic durable review resume Gherkin integration", () => {
  const feature = readFileSync(featurePath, "utf8");

  it("keeps the neutral scenarios wired to the live generic phase executor", () => {
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const planner = readFileSync(plannerPath, "utf8");
    const reviewState = readFileSync(reviewStatePath, "utf8");
    const executionPlanning = readFileSync(executionPlanningPath, "utf8");
    const publication = readFileSync(publicationPath, "utf8");

    expect(feature).toContain("Scenario: A reviewer crash after a durable fixer handoff resumes the reviewer");
    expect(feature).toContain("Scenario: A fixer response without its receipt resumes evidence recovery");
    expect(feature).toContain("Scenario: A reviewer can request another fixer cycle");
    expect(feature).toContain("Scenario: A committed approval resumes at phase exit");
    expect(feature).toContain("Scenario: Repeated remediation does not invent a replan transition");
    expect(feature).toContain("Scenario: Earlier phases do not consume a later phase review budget");
    expect(feature).toContain("Scenario: An invalid fixer handoff is repaired in the same run");
    expect(feature).toContain("Scenario: A same-run handoff repair keeps its authoritative identities");
    expect(feature).toContain("Scenario: A blocked review stops the current run");
    expect(feature).not.toMatch(/FEAT-\d+|Phase 2|architecture debt/i);
    expect(orchestrator).toContain("this.dependencies.planning.prepare({");
    expect(executionPlanning).toContain("this.dependencies.resolveReviewState({");
    expect(reviewState).toContain("this.dependencies.plan({");
    expect(planner).toContain("selectReviewResumeRoute({");
    expect(planner).toContain('resolvingReviewFindings: reviewResumeRoute === "fixer"');
    expect(planner).toContain('phaseReadyForReviewGate: reviewResumeRoute === "reviewer"');
    expect(planner).toContain('const resumingAtPhaseExit = reviewResumeRoute === "phase_exit"');
    expect(publication).toContain("reviewer requested changes; continuing with the fixer in the same run");
    expect(orchestrator).toContain("phaseIndex -= 1");
    expect(orchestrator).not.toContain("findReviewerOwnedRemediationReplan");
    expect(orchestrator).not.toContain("evaluatePersistedReviewManifestations");
  });

  it("preflights immutable bindings and routes invalid handoffs through same-run phase repair", () => {
    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const handoff = readFileSync(handoffPath, "utf8");
    const publication = readFileSync(remediationSuccessorPublicationPath, "utf8");
    const workerResult = readFileSync(workerResultApplicationPath, "utf8");
    const preflightIndex = publication.indexOf("this.dependencies.assertBindings(");
    const persistenceIndex = publication.indexOf("this.dependencies.ingest({", preflightIndex);

    expect(handoff).toContain('assertReferenceBinding("remediationResponse.manifestReference"');
    expect(handoff).toContain('assertExactBinding(`${path}.relativePath`');
    expect(preflightIndex).toBeGreaterThan(0);
    expect(persistenceIndex).toBeGreaterThan(preflightIndex);
    expect(orchestrator).toContain("this.dependencies.workerResult.process({");
    expect(workerResult).toContain("this.dependencies.publishSuccessor({");
    expect(workerResult).toContain("this.dependencies.prepareRepair({");
    expect(workerResult).toContain('trigger: "authoritative_handoff_invalid"');
    expect(orchestrator).toMatch(/this\.dependencies\.workerResult\.process[\s\S]*?phaseIndex -= 1;[\s\S]*?continue;/);
  });

  it("executes an invalid-handoff retry with one stable blind identity lease", () => {
    const scope = {
      projectId: "arbitrary-project",
      featureId: "arbitrary-work-item",
      phaseNumber: 731,
      reviewGateId: "code-review" as const,
    };
    const predecessor = {
      artifactKind: "review_manifest" as const,
      artifactId: "arbitrary-predecessor",
      contentHash: "a".repeat(64),
      relativePath: "arbitrary/review_manifest/a.json",
    };
    let allocations = 0;
    const createArtifactId = (kind: "remediation-response" | "verification-receipt") =>
      `${kind}-${++allocations}`;
    const initial = resolveReviewRemediationSuccessorIdentityLease({
      current: null,
      predecessor,
      scope,
      createArtifactId,
    });
    const output = (responseArtifactId: string, receiptArtifactId: string) => [
      "## Hepha V1 Remediation Response",
      "```json",
      JSON.stringify({
        artifactKind: "remediation_response",
        artifactId: responseArtifactId,
        scope,
        manifestReference: predecessor,
      }),
      "```",
      "## Hepha V1 Verification Receipt",
      "```json",
      JSON.stringify({
        artifactKind: "verification_receipt",
        artifactId: receiptArtifactId,
        scope,
        manifestReference: predecessor,
        responseReference: {
          artifactKind: "remediation_response",
          artifactId: responseArtifactId,
          contentHash: REMEDIATION_RESPONSE_HASH_PLACEHOLDER,
          relativePath: REMEDIATION_RESPONSE_PATH_PLACEHOLDER,
        },
      }),
      "```",
    ].join("\n");

    expect(() => assertReviewRemediationSuccessorHandoffBindings(
      parseReviewRemediationSuccessorHandoff(output("incorrect-first-response", initial.receiptArtifactId)),
      initial,
    )).toThrow(`expected "${initial.responseArtifactId}"`);

    const repaired = resolveReviewRemediationSuccessorIdentityLease({
      current: initial,
      predecessor,
      scope,
      createArtifactId,
    });

    expect(repaired).toEqual(initial);
    expect(allocations).toBe(2);
    expect(() => assertReviewRemediationSuccessorHandoffBindings(
      parseReviewRemediationSuccessorHandoff(output(repaired.responseArtifactId, repaired.receiptArtifactId)),
      repaired,
    )).not.toThrow();

    const orchestrator = readFileSync(orchestratorPath, "utf8");
    const remediationSuccessorApplication = readFileSync(remediationSuccessorApplicationPath, "utf8");
    const workerExecutionApplication = readFileSync(workerExecutionApplicationPath, "utf8");
    expect(orchestrator).toContain("this.dependencies.workerExecution.execute({");
    expect(workerExecutionApplication).toContain("this.dependencies.prepareSuccessor({");
    expect(remediationSuccessorApplication).toContain("this.dependencies.resolveIdentityLease({");
    expect(orchestrator).toContain("remediationSuccessorIdentityLease = workerExecution.identityLease");
  });

  it("executes the crash-resume and repeated-review decisions", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "verification_receipt",
    })).toBe("reviewer");

    expect(selectReviewResumeRoute({
      ...ready,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "NEEDS_CHANGES",
    })).toBe("fixer");

    expect(selectReviewResumeRoute({
      ...ready,
      awaitingIndependentRerun: true,
      currentDurableArtifactKind: "remediation_response",
    })).toBe("fixer");
  });

  it("executes the committed-approval crash decision without another reviewer", () => {
    expect(selectReviewResumeRoute({
      ...ready,
      currentDurableArtifactKind: "review_manifest",
      currentDurableManifestResult: "APPROVED",
      currentDurableGateState: "APPROVED",
    })).toBe("phase_exit");
  });

  it("keeps routing by the latest durable result after many cycles in multiple phases", () => {
    for (const previousPhaseCycles of [0, 3, 7, 12]) {
      for (let cycle = 0; cycle <= previousPhaseCycles; cycle += 1) {
        expect(selectReviewResumeRoute({
          ...ready,
          awaitingIndependentRerun: true,
          currentDurableArtifactKind: "review_manifest",
          currentDurableManifestResult: "NEEDS_CHANGES",
        })).toBe("fixer");
      }
    }
  });

  it("keeps durable receipt presentation bounded without making it routing authority", () => {
    const integration = readFileSync(integrationPath, "utf8");
    expect(integration).toContain(".filter((receipt) => receipt.cycleId === gate.cycleId)");
  });
});
