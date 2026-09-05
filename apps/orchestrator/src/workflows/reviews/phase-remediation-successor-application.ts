import type { WorkItemCard } from "@hepha/shared";
import { relative, resolve } from "node:path";
import {
  readAuthoritativeReviewRerunLineageContext,
} from "../../authoritative-review-integration.js";
import type { StoredProject } from "../../projects/stored-project.js";
import type { ReviewRemediationFindingIdentity } from "../../review-remediation-lifecycle-policy.js";
import {
  type ReviewRemediationSuccessorArtifactKind,
  type ReviewRemediationSuccessorBindingExpectation,
} from "../../review-remediation-successor-handoff.js";
import type { PhaseRemediationSuccessorHandoff } from "../prompts/phase-remediation-successor-prompt.js";

export interface AuthoritativePhaseRemediationSuccessorHandoff
  extends Omit<PhaseRemediationSuccessorHandoff, "predecessor" | "scope"> {
  readonly predecessor: ReviewRemediationSuccessorBindingExpectation["predecessor"];
  readonly scope: ReviewRemediationSuccessorBindingExpectation["scope"] & { readonly reviewGateId: "code-review" };
}

export interface PhaseRemediationSuccessorResult {
  handoff?: AuthoritativePhaseRemediationSuccessorHandoff;
  identityLease: ReviewRemediationSuccessorBindingExpectation | null;
}

/** Allocates the exact immutable response/receipt handoff for one fixer cycle. */
export class PhaseRemediationSuccessorApplication {
  constructor(private readonly dependencies: {
    canonicalFeatureId: (feature: WorkItemCard) => string | null;
    createArtifactId: (phaseNumber: number, kind: ReviewRemediationSuccessorArtifactKind, runId: string) => string;
    projectLifecycle: (findings: readonly ReviewRemediationFindingIdentity[]) => PhaseRemediationSuccessorHandoff["lifecycleProjection"];
    readLineage: typeof readAuthoritativeReviewRerunLineageContext;
    resolveIdentityLease: (input: {
      current: ReviewRemediationSuccessorBindingExpectation | null;
      predecessor: ReviewRemediationSuccessorBindingExpectation["predecessor"];
      scope: ReviewRemediationSuccessorBindingExpectation["scope"];
      createArtifactId: (kind: ReviewRemediationSuccessorArtifactKind) => string;
    }) => ReviewRemediationSuccessorBindingExpectation;
  }) {}

  prepare(input: {
    configuredDatabasePath?: string | null;
    currentIdentityLease: ReviewRemediationSuccessorBindingExpectation | null;
    feature: WorkItemCard;
    findings: readonly ReviewRemediationFindingIdentity[];
    phaseNumber: number;
    phaseRef: string;
    project: StoredProject;
    resolvingReviewFindings: boolean;
    reviewRequired: boolean;
    runId: string;
  }): PhaseRemediationSuccessorResult {
    if (!input.resolvingReviewFindings || !input.reviewRequired) {
      return { identityLease: null };
    }
    const featureId = this.dependencies.canonicalFeatureId(input.feature);
    if (!featureId) throw new Error(`${input.phaseRef}: invalid authoritative review feature identity.`);
    const databasePath = input.configuredDatabasePath
      ?? resolve(input.project.rootPath, ".hepha", "hepha.sqlite");
    const scope = {
      projectId: input.project.id,
      featureId,
      phaseNumber: input.phaseNumber,
      reviewGateId: "code-review" as const,
    };
    const lineage = this.dependencies.readLineage({
      projectRoot: input.project.rootPath,
      databasePath,
      expectedScope: scope,
    });
    if (lineage.kind === "unavailable") {
      throw new Error(`${input.phaseRef}: authoritative remediation predecessor is unavailable.`);
    }
    if (lineage.kind !== "required") {
      return { identityLease: null };
    }
    const identityLease = this.dependencies.resolveIdentityLease({
      current: input.currentIdentityLease,
      predecessor: lineage.predecessor,
      scope,
      createArtifactId: (kind) => this.dependencies.createArtifactId(
        input.phaseNumber,
        kind,
        input.runId,
      ),
    });
    return {
      identityLease,
      handoff: {
        databasePath,
        featureRootPath: relative(input.project.rootPath, input.feature.folderPath).replaceAll("\\", "/"),
        lifecycleProjection: this.dependencies.projectLifecycle(lineage.findings),
        predecessor: identityLease.predecessor,
        receiptArtifactId: identityLease.receiptArtifactId,
        responseArtifactId: identityLease.responseArtifactId,
        scope: { ...identityLease.scope, reviewGateId: "code-review" },
      },
    };
  }
}
