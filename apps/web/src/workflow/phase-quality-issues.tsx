import React from "react";
import type { PhaseQualityBlocker } from "./phase-quality-blockers.js";

export type ResolvePhaseGate = (blocker: PhaseQualityBlocker, action: "repair" | "waive", note: string, confirmExecutionPrerequisites?: boolean) => void;

/** Opening the disclosure never dispatches work; actions require explicit intent. */
export function PhaseQualityIssues({ blockers, onResolve, disabled = false, warnings = false }: {
  readonly warnings?: boolean; readonly blockers: readonly PhaseQualityBlocker[]; readonly onResolve?: ResolvePhaseGate; readonly disabled?: boolean;
}) {
  if (!blockers.length) return null;
  return (
    <details className="phase-quality-issues">
      <summary>{blockers.length} {warnings ? "non-blocking warning" : "verification issue"}{blockers.length === 1 ? "" : "s"} — how to resolve</summary>
      {blockers.map(blocker => (
        <section className="phase-quality-issue" key={blocker.title} aria-label={blocker.title}>
          <strong>{blocker.title}</strong>
          <p>{blocker.explanation}</p>
          {blocker.recordedReason && <p>Recorded diagnostic: {blocker.recordedReason}</p>}
          <p>{blocker.evidencePaths.length ? "Recorded evidence references (require verification):" : "No evidence reference recognised for this gate."}</p>
          {blocker.evidencePaths.length > 0 && <ul>{blocker.evidencePaths.map(path => <li key={path}><code>{path}</code></li>)}</ul>}
          <strong>How to resolve</strong>
          <ol>{blocker.steps.map(step => <li key={step}>{step}</li>)}</ol>
          {onResolve && <GateActions warning={warnings} blocker={blocker} onResolve={onResolve} disabled={disabled} />}
        </section>
      ))}
    </details>
  );
}

function GateActions({ blocker, onResolve, disabled, warning }: { warning: boolean; blocker: PhaseQualityBlocker; onResolve: ResolvePhaseGate; disabled: boolean }) {
  const [note, setNote] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  return <div className="phase-gate-actions">
    <label><span>Instruction or justification</span><textarea aria-label={`Instruction or justification for ${blocker.title}`} value={note} maxLength={4000}
      onChange={event => { setNote(event.target.value); setConfirmed(false); }} rows={3} disabled={disabled}
      placeholder="For example: verify the existing results, or add missing integration scenarios." /></label>
    <small>HEPHA checks the result after each repair and feeds unresolved findings into the next attempt. After three unsuccessful rounds, review the diagnosis and add guidance here before retrying.</small>
    <button className="mini-button validation-action" type="button" disabled={disabled} onClick={() => onResolve(blocker, "repair", note.trim())}>{warning ? "Verify / repair this warning" : "Verify / repair this gate"}</button>
    {!warning && <><label className="workflow-toggle"><input type="checkbox" checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />
      <span>I explicitly approve this gate waiver; it is not a passing test result.</span></label>
    <button className="mini-button" type="button" disabled={disabled || !confirmed || note.trim().length < 20} onClick={() => onResolve(blocker, "waive", note.trim())}>Waive this gate</button>
    <small>A waiver needs at least 20 characters of justification. Known failed or rejected checks must be repaired.</small></>}
  </div>;
}
