import React, { useEffect, useState } from "react";
import type { PhaseCompletionQualityGap } from "@hepha/shared";
import type { ResolvePhaseGate } from "./phase-quality-issues.js";

/** Details collapse; repair and evidence confirmation remain visible on the owning phase. */
export function PhaseCompletionQualityGaps({ gaps, disabled, onRepair, onConfirm }: {
  gaps: readonly PhaseCompletionQualityGap[]; disabled: boolean; onRepair?: ResolvePhaseGate; onConfirm?: (proposalId: string) => void;
}) {
  const [note, setNote] = useState("");
  const [acknowledged, setAcknowledged] = useState<string | null>(null);
  useEffect(() => { if (disabled) setAcknowledged(null); }, [disabled]);
  if (!gaps.length) return null;
  const repairs = gaps.filter(gap => gap.kind !== "coverage_confirmation");
  const first = repairs.find(gap => gap.kind === "evidence_investigation") ?? repairs[0] ?? gaps[0]!;
  const proposal = gaps.find(gap => gap.proposalId);
  const needsInvestigation = repairs.some(gap => gap.kind === "evidence_investigation");
  const executions = repairs.flatMap(gap => gap.executions ?? []);
  const prerequisites = [...new Set(executions.flatMap(execution => execution.prerequisite ? [execution.prerequisite] : []))];
  const prerequisiteKey = JSON.stringify(executions);
  const executionOnly = repairs.length > 0 && repairs.every(gap => gap.kind === "execution_evidence");
  const failedVerification = repairs.some(gap => gap.kind === "verification_failure");
  const prerequisitesReady = !prerequisites.length || acknowledged === prerequisiteKey;
  return <section className="phase-completion-quality-gaps" data-phase-recovery-controls tabIndex={-1} aria-label={`Phase ${first.phaseNumber} completion quality gaps`}>
    <strong>{repairs.length ? `${repairs.length} completion quality gap${repairs.length === 1 ? "" : "s"}` : "Coverage review required"}</strong>
    {repairs.length > 0 && <p>{failedVerification ? "The failed commands and reports are supplied to the repair agent. It will trace the owning tasks, compare earlier green evidence, repair justified issues and rerun verification." : "Only unresolved repair instructions are saved in this phase document and supplied to the repair agent. Existing passing tests must not be repeated without a reason."}</p>}
    {proposal && <p>Verified evidence for {new Set(gaps.flatMap(gap => gap.proposedLinks?.map(link => link.sourceId) ?? [])).size} criteria awaits your confirmation. This does not cover the unresolved criteria below.</p>}
    {gaps.map(gap => <details key={gap.id}>
      <summary>{gap.title}{gap.sourceIds.length ? ` — ${gap.sourceIds.length} criteria` : ""}</summary>
      <ul>{gap.details.map((detail, index) => <li key={index}>{detail}</li>)}</ul>
      {gap.proposedLinks?.length ? <section aria-label="Proposed acceptance coverage links">
        <p>These proposed links need your confirmation of full criterion coverage. Confirmation is not a test pass or waiver.</p>
        <ul>{gap.proposedLinks.map((link, index) => <li key={index}><strong>{link.sourceId} → {link.evidenceId}</strong>
          {link.stepNumbers && ` — steps ${link.stepNumbers.join(", ")}`}<p>{link.explanation}</p></li>)}</ul>
      </section> : null}
    </details>)}
    {executions.length > 0 && <section aria-label="Existing verification to execute"><p>Tests are identified, but required execution evidence is missing. Reuse these tests; do not implement them again.</p>
      <ul>{executions.map((execution, index) => <li key={index}><code>{execution.command}</code><p>{execution.testPaths.join(", ")}</p></li>)}</ul>
      {prerequisites.map(prerequisite => <p key={prerequisite}>{prerequisite}</p>)}
      {prerequisites.length > 0 && <><p>Use the project setup instructions to supply the environment. Do not paste credentials here. The worker will check availability; this acknowledgement is not a pass.</p>
        <label><input type="checkbox" disabled={disabled} checked={prerequisitesReady} onChange={event => setAcknowledged(event.target.checked ? prerequisiteKey : null)} />The listed execution prerequisites are available</label></>}
    </section>}
    {onRepair && repairs.length > 0 && <><label>Additional repair guidance (optional)<textarea rows={2} maxLength={4000} disabled={disabled}
      value={note} onChange={event => setNote(event.target.value)} placeholder="The saved phase context is included automatically." /></label>
      <small>After three unsuccessful repair rounds, HEPHA reports what remains unresolved. Add guidance here to steer the next repair loop; existing evidence is included automatically.</small>
      <button type="button" className="mini-button validation-action" disabled={disabled || !prerequisitesReady} onClick={() => onRepair({
        gate: "completion_recovery", phaseNumber: first.phaseNumber, phaseTitle: first.phaseTitle, title: first.title,
        explanation: "Phase completion quality recovery", recordedReason: null, evidencePaths: [], steps: [],
      }, "repair", note, prerequisites.length ? prerequisitesReady : undefined)}>{needsInvestigation ? "Investigate and fix phase findings" : executionOnly ? "Run existing verification" : failedVerification ? "Fix failing tests / checks" : "Verify / repair phase quality gaps"}</button></>}
    {proposal?.proposalId && onConfirm && <button type="button" className="mini-button validation-action" disabled={disabled}
      onClick={() => onConfirm(proposal.proposalId!)}>I confirm these evidence links cover the listed criteria</button>}
  </section>;
}
