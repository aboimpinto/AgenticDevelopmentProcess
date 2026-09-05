import type { AuthoritativeReviewRerunLineageContext } from "../../authoritative-review-integration.js";
import type { ReviewContractRepairSources } from "../reviews/review-contract-repair-source-repository.js";

export interface ReviewContractRepairPromptOptions {
  readonly artifactId: string;
  readonly attempt: number;
  readonly draft: string;
  readonly lineage?: Exclude<AuthoritativeReviewRerunLineageContext, { readonly kind: "unavailable" }>;
  readonly maximumAttempts: number;
  readonly rejectionCode: string;
  readonly rejectionMessage: string;
  readonly scope: {
    readonly featureId: string;
    readonly phaseNumber: number;
    readonly projectId: string;
    readonly reviewGateId: "code-review";
  };
}

/** Composes schema-only repair of an already completed independent review. */
export function buildReviewContractRepairPrompt(
  options: ReviewContractRepairPromptOptions,
  sources: ReviewContractRepairSources,
) {
  const lineageRule = options.lineage?.kind === "required"
    ? `Use this exact lineage object and do not alter it: ${JSON.stringify({ lineage: { predecessors: [options.lineage.predecessor] } })}`
    : "This is a baseline review. Do not add lineage.";

  return [
    "You are Hepha's Review Contract Repair Agent.",
    "Repair only the JSON contract representation of an already completed independent code review.",
    "Do not review code, inspect files, run commands, edit files, add findings, remove findings, change the review result, or change the substantive summary, root cause, remediation, test, surface, severity, disposition, or compatibility decisions.",
    "Correct only fields needed to make the existing review draft conform to the supplied V1 schemas and authoritative bindings.",
    "Return exactly one raw JSON object and nothing else: no Markdown, code fence, or explanatory prose.",
    "",
    `Repair attempt: ${options.attempt} of ${options.maximumAttempts}`,
    `Safe validator rejection: ${options.rejectionCode} — ${options.rejectionMessage}`,
    `Use this exact artifactId: ${JSON.stringify(options.artifactId)}`,
    `Use this exact scope: ${JSON.stringify(options.scope)}`,
    `Every acceptance-criterion authority reference must be "ac:${options.scope.featureId}:<criterionId>". The feature segment must exactly equal scope.featureId; never shorten it to a display ID.`,
    "Every acceptance-criterion source.relativePath must be a POSIX path relative to the project root.",
    lineageRule,
    "For active_rule authorities, use only an active catalog entry and copy its complete snapshot exactly.",
    "",
    "Exact review-manifest schema:",
    sources.manifestSchema,
    "",
    "Exact common review-contract schema:",
    sources.commonSchema,
    "",
    "Active architecture-rule catalog:",
    sources.activeRuleCatalog,
    "",
    "Rejected review draft to repair:",
    options.draft,
  ].join("\n");
}
