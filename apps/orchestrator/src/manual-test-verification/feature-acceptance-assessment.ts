import { createJsonExchangeProtocol, readExchangeSchema } from "../exchanges/json-exchange-protocol.js";
import type { AcceptanceCoverageLink } from "@hepha/shared";
import type { ManualTestDeliveryModel } from "./delivery-model.js";
import { validateCoverageLinks, validateCoverageContributions, type CoverageRecoveryRecord } from "./acceptance-coverage-reconciliation.js";
import { scopeHash, type ReadinessImprovement } from "./accepted-feature-scope.js";
import { CoverageResponseValidationError } from "./coverage-response-correction.js";

type Contribution = Omit<AcceptanceCoverageLink, "sourceId">;
export interface FeatureAcceptanceAssessment {
  baselineId: string;
  criteria: { sourceId: string; status: "satisfied" | "unmet" | "evidence_pending"; contributions: Contribution[];
    gap?: { obligation: string; expected: string; observed: string; references: string[]; nextAction: string };
    evidenceNeed?: { kind?: "execution_missing" | "environment_blocked" | "evidence_missing" | "investigation_required"; reason: string; references: string[]; nextAction: string } }[];
  improvements: { observation: string; rationale: string; references: string[] }[];
}
export const featureAcceptanceExchange = createJsonExchangeProtocol<FeatureAcceptanceAssessment>(
  "feature.acceptance.assessment", readExchangeSchema("feature-acceptance-assessment-v2"));

export function decodeFeatureAcceptance(raw: string, model: ManualTestDeliveryModel) {
  const decoded = featureAcceptanceExchange.decode(raw);
  const fail = (path: string, expected: string, value: unknown): never => { throw new CoverageResponseValidationError(path, expected, value); };
  if (!decoded.valid) return fail("$", `feature.acceptance.assessment JSON matching the supplied schema: ${decoded.diagnostics.slice(0, 12).map(d => `${d.path}: ${d.message}`).join("; ")}`, decoded.diagnostics);
  const result = decoded.value.payload, baseline = model.acceptedScope;
  if (!baseline || result.baselineId !== baseline.id) return fail("baselineId", "the host supplied accepted baseline ID", result.baselineId);
  const requested = new Set(model.coverageMap.map(c => c.sourceId));
  const seen = new Set<string>();
  const links: AcceptanceCoverageLink[] = [], partialLinks: AcceptanceCoverageLink[] = [];
  const unresolved: CoverageRecoveryRecord["unresolved"] = [];
  for (const c of result.criteria) {
    const accepted = baseline.criteria.find(x => x.sourceId === c.sourceId);
    if (!accepted || !requested.has(c.sourceId) || seen.has(c.sourceId)) return fail("criteria.sourceId", "exactly one entry per requested accepted criterion", c.sourceId);
    seen.add(c.sourceId);
    const contributions = c.contributions.map(link => ({ ...link, sourceId: c.sourceId }));
    try {
      validateCoverageContributions(contributions, model);
      if (c.status === "satisfied") validateCoverageLinks(contributions, model);
    } catch (error) { return fail(`criteria.${c.sourceId}.contributions`, `valid applicable evidence${error instanceof Error ? `: ${error.message}` : ""}`, error); }
    if (c.status === "satisfied") links.push(...contributions);
    else {
      partialLinks.push(...contributions);
      if (c.status === "unmet") {
        const gap = c.gap!;
        // Require an exact accepted obligation excerpt. A new model requirement
        // cannot become a blocker just by borrowing a valid criterion ID.
        if (!accepted.text.includes(gap.obligation) || !accepted.text.includes(gap.expected)) return fail(`criteria.${c.sourceId}.gap.obligation`, "an exact excerpt of this accepted criterion", gap.obligation);
        unresolved.push({ sourceId: c.sourceId, reason: `${gap.obligation} — Expected: ${gap.expected}. Observed: ${gap.observed}`,
          diagnosis: { kind: "implementation_missing", explanation: gap.observed, references: gap.references, nextAction: gap.nextAction } });
      } else {
        const need = c.evidenceNeed!;
        unresolved.push({ sourceId: c.sourceId, reason: need.reason, ...(need.kind === "execution_missing" || need.kind === "environment_blocked" ? {} : { investigation: true }),
          diagnosis: { kind: need.kind ?? "investigation_required", explanation: need.reason, references: need.references, nextAction: need.nextAction } });
      }
    }
  }
  if (seen.size !== requested.size) return fail("criteria", "every requested criterion accounted for", [...seen]);
  const improvements: ReadinessImprovement[] = result.improvements.map(item => ({ ...item,
    id: scopeHash([baseline.id, item.observation.trim(), item.references.slice().sort()]), status: "proposed-for-future-planning" }));
  return { proposal: { id: `assessment-${scopeHash(result)}`, links }, partialLinks, unresolved, improvements,
    assessment: result };
}
