import React, { useState } from "react";
import type { CompletionRecoveryAssessment, CompletionRecoveryBlocker } from "@hepha/shared";

export function CompletionRecoveryDetails({ assessment, pending, onResolve, phases = [], onAssign }: {
  assessment: CompletionRecoveryAssessment;
  pending: boolean;
  onResolve?: (blocker: CompletionRecoveryBlocker) => void;
  phases?: readonly { number: number | null; title: string }[];
  onAssign?: (phaseNumber: number) => void;
}) {
  const [selected, setSelected] = useState("");
  const phaseBlockers = assessment.blockers.filter(blocker => blocker.action === "phase");
  const repairGaps = assessment.phaseGaps?.filter(gap => gap.kind !== "coverage_confirmation") ?? [];
  const qualityCount = repairGaps.length + phaseBlockers.filter(blocker => blocker.id.startsWith("quality-")).length;
  const repairPhases = new Set([...repairGaps.map(gap => gap.phaseNumber), ...phaseBlockers.filter(b => b.id.startsWith("quality-")).map(b => b.phaseNumber)]);
  return <div className="completion-recovery-details">
    {qualityCount > 0 && <p>{qualityCount} quality gap{qualityCount === 1 ? "" : "s"} in {repairPhases.size} phase{repairPhases.size === 1 ? "" : "s"}. Resolve them in the phases above.</p>}
    {assessment.phaseGaps?.some(gap => gap.kind === "coverage_confirmation") && <p>Existing coverage awaits confirmation in the phase. No repair is needed for those criteria.</p>}
    {assessment.blockers.filter(blocker => blocker.action !== "phase" && blocker.action !== "manual_tests" && !(blocker.action === "external" && blocker.phaseNumber != null)).map(blocker => <div key={blocker.id}>
      <p>{blocker.message}</p>
      {blocker.prerequisite && <p className="gate-message">{blocker.prerequisite}</p>}
      {blocker.action === "coverage_owner" && <><label>Verification recovery phase<select value={selected} disabled={pending} onChange={event => setSelected(event.target.value)}>
        <option value="">Choose a phase</option>{phases.filter(phase => phase.number !== null).map(phase => <option key={phase.number} value={phase.number!}>Phase {phase.number} — {phase.title}</option>)}
      </select></label><button type="button" className="mini-button validation-action" disabled={pending || !selected || !onAssign} onClick={() => onAssign?.(Number(selected))}>Assign phase quality gaps</button></>}
      {blocker.action !== "external" && blocker.action !== "coverage_owner" && onResolve && <button type="button" className="mini-button validation-action"
        disabled={pending} onClick={() => onResolve(blocker)}>{blocker.actionLabel}</button>}
    </div>)}
  </div>;
}
