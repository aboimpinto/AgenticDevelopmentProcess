import { createHash } from "node:crypto";
import type { AcceptanceCoverageLink } from "@hepha/shared";
import type { ManualTestDeliveryModel } from "./delivery-model.js";

/** Preserve an explicit confirmation only while its exact source, evidence and human outcome remain unchanged. */
export function coverageLinkBinding(link: AcceptanceCoverageLink, model: ManualTestDeliveryModel) {
  const source = model.manifestEntries.find(entry => entry.sourceId === link.sourceId);
  const evidence = link.kind === "automated" ? model.automatedEvidence.find(entry => entry.id === link.evidenceId) : model.tests.find(entry => entry.id === link.evidenceId);
  const recovery = (model as ManualTestDeliveryModel & { recoveryContext?: { manualResults?: { testId: string }[]; phaseAcceptanceAssessments?: { coverage?: { criteria: { criterionId: string }[] } }[] } }).recoveryContext;
  const result = link.kind === "manual" ? recovery?.manualResults?.find(entry => entry.testId === link.evidenceId) : undefined;
  const assertions = link.kind === "automated" ? recovery?.phaseAcceptanceAssessments?.filter(phase => phase.coverage?.criteria.some(criterion => criterion.criterionId === link.sourceId)) : undefined;
  return source && evidence ? createHash("sha256").update(JSON.stringify([link, source, evidence, result, ...(assertions?.length ? [assertions] : [])])).digest("hex") : "";
}
export const coverageLinkKey = (link: AcceptanceCoverageLink) => JSON.stringify(link);
