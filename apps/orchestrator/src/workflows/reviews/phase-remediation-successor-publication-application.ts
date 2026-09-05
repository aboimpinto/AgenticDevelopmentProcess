import {
  ingestAndRenderAuthoritativeReviewSuccessor,
} from "../../authoritative-review-integration.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type {
  ReviewRemediationSuccessorBindingExpectation,
  ReviewRemediationSuccessorHandoff,
} from "../../review-remediation-successor-handoff.js";
import type { AuthoritativePhaseRemediationSuccessorHandoff } from "./phase-remediation-successor-application.js";

export type PhaseRemediationSuccessorPublicationResult =
  | Readonly<{ kind: "published"; summary: string }>
  | Readonly<{ kind: "repair_required"; detail: string }>;

/** Validates and immutably publishes a fixer's response/receipt successor pair in order. */
export class PhaseRemediationSuccessorPublicationApplication {
  constructor(private readonly dependencies: {
    assertBindings: (
      handoff: ReviewRemediationSuccessorHandoff,
      expected: ReviewRemediationSuccessorBindingExpectation,
    ) => void;
    bindReceipt: (rawReceipt: string, responseReference: {
      artifactKind: "remediation_response";
      artifactId: string;
      contentHash: string;
      relativePath: string;
    }) => string;
    ingest: typeof ingestAndRenderAuthoritativeReviewSuccessor;
    now: () => string;
    parse: (output: string) => ReviewRemediationSuccessorHandoff;
  }) {}

  publish(input: {
    handoff: AuthoritativePhaseRemediationSuccessorHandoff;
    phaseOutput: string;
    phaseRef: string;
    project: StoredProject;
  }): PhaseRemediationSuccessorPublicationResult {
    let successor: ReviewRemediationSuccessorHandoff;
    try {
      successor = this.dependencies.parse(input.phaseOutput);
      this.dependencies.assertBindings(successor, {
        predecessor: input.handoff.predecessor,
        receiptArtifactId: input.handoff.receiptArtifactId,
        responseArtifactId: input.handoff.responseArtifactId,
        scope: input.handoff.scope,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: "repair_required",
        detail: `${input.phaseRef}: authoritative remediation handoff is invalid. ${message}`,
      };
    }

    const responseIngress = this.dependencies.ingest({
      projectRoot: input.project.rootPath,
      databasePath: input.handoff.databasePath,
      featureRootPath: input.handoff.featureRootPath,
      expectedScope: input.handoff.scope,
      rawPayload: successor.remediationResponse,
      ingestedAt: this.dependencies.now(),
      enforcementEnabled: true,
    });
    if (responseIngress.kind !== "persisted") {
      const code = responseIngress.kind === "refusal" ? responseIngress.code : "non_authoritative";
      const detail = `${input.phaseRef}: authoritative remediation response ingestion refused (${code})${responseIngress.kind === "refusal" ? `: ${responseIngress.message}` : ""}.`;
      if (responseIngress.kind === "refusal" && responseIngress.code === "invalid_input") {
        return { kind: "repair_required", detail };
      }
      throw new Error(detail);
    }
    const responseReference = {
      artifactKind: "remediation_response" as const,
      artifactId: input.handoff.responseArtifactId,
      contentHash: responseIngress.ingestion.contentHash,
      relativePath: `${input.handoff.featureRootPath}/code-reviews/artifacts/remediation_response/${responseIngress.ingestion.contentHash}.json`,
    };
    let boundReceipt: string;
    try {
      boundReceipt = this.dependencies.bindReceipt(successor.verificationReceipt, responseReference);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${input.phaseRef}: authoritative verification handoff is invalid. ${message}`);
    }
    const receiptIngress = this.dependencies.ingest({
      projectRoot: input.project.rootPath,
      databasePath: input.handoff.databasePath,
      featureRootPath: input.handoff.featureRootPath,
      expectedScope: input.handoff.scope,
      rawPayload: boundReceipt,
      ingestedAt: this.dependencies.now(),
      enforcementEnabled: true,
    });
    if (receiptIngress.kind !== "persisted") {
      const code = receiptIngress.kind === "refusal" ? receiptIngress.code : "non_authoritative";
      throw new Error(`${input.phaseRef}: authoritative verification receipt ingestion refused (${code}).`);
    }
    return {
      kind: "published",
      summary: `${input.phaseRef}: persisted authoritative remediation response and verification receipt for the review rerun.`,
    };
  }
}
