# FEAT-042: Code Review Finding Ledger And Repair Loop

**Feature ID**: FEAT-042
**Parent Epic**: EPIC-008
**Status**: Completed

## Summary

Store code-review findings per implementation phase from a canonical typed review payload, classify the resulting decisions, detect unresolved blocking or required findings, and orchestrate a workflow-owned bounded repair/review rerun loop when fixes are required. The feature integrates with existing run timeline storage so review findings, repair attempts, decisions, and rerun outcomes remain auditable as part of the autonomous implementation workflow.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
| --- | --- | --- |
| Acceptance Criteria | Ledger plus required-fix rerun loop | Persist findings per phase, classify decisions, detect unresolved blocker/required findings, trigger repair context, and re-run review until required findings are resolved. |
| Validation | Keep backend ledger and repair loop | Proceed with backend storage, pure finding reconciliation helpers, timeline integration, and repair/review rerun orchestration; no new dashboard board. |
| Review output contract | Typed review payload | Code-review runs must produce a structured finding payload that is the canonical source for ledger writes, avoiding brittle Markdown parsing. |
| Ledger persistence | Separate additive ledger tables | Add SQLite tables for findings, decisions, and repair attempts, linked to existing phase/run/timeline entries for auditability and backward compatibility. |
| Persistence boundary | Tables plus pure helpers | Keep SQLite persistence in an I/O adapter and keep fingerprint/reconciliation logic in pure deterministic helpers that can be unit tested directly. |
| Finding reconciliation | Stable fingerprint plus decisions | Use pure helpers to derive normalized fingerprints from phase, affected area/evidence, severity, and finding text, then apply explicit decision and resolution records. |
| Repair loop bounds | Workflow-owned bounded loop | Run repair context generation, repair attempt recording, review rerun, and max-attempt escalation inside the EPIC-008 workflow. |
| Escalation | Stop automatic repair at threshold | Auto-generate repair context and rerun review until required-fix findings are resolved or the configured max-attempt threshold escalates to failed or needs-human state. |

## Scope

This FEAT is a backend EPIC-008 repair-loop slice.

In scope:

- A typed structured code-review finding payload as the canonical source for persisted findings.
- Persistent code-review finding ledger storage using additive SQLite tables.
- Per-phase association between review findings and implementation/review runs.
- Links from ledger records to existing timeline entries for auditability.
- Separate records for review findings, finding decisions, and repair attempts.
- A persistence adapter that handles SQLite I/O separately from pure reconciliation logic.
- Decision classification for findings:
  - blocker
  - required
  - note
  - deferred
  - accepted risk
  - rebutted
  - follow-up
- Deterministic helper logic for reconciling current findings with prior findings and decisions.
- Stable finding fingerprint generation from normalized phase, affected area/evidence, severity, and finding text.
- Detection of unresolved blocker and required findings.
- Repair context generation for unresolved required work.
- Workflow-owned bounded review rerun orchestration after repairs.
- Escalation to an explicit failed or needs-human state when the configured repair/review attempt limit is reached.
- Integration with existing run timeline storage so review, repair, and rerun events are visible in the workflow history.

Out of scope:

- A new dashboard board or separate review UI.
- Replacing existing timeline storage.
- Markdown parsing as the canonical source for finding persistence.
- Starting implementation, review, or completion work outside the EPIC-008 workflow.
- Manual code-review policy design beyond the decision classes listed above.
- Runtime MCP dependency for the repair loop.

## Review Output Contract

Code-review runs must expose a typed structured payload for findings. That payload is the canonical input for ledger writes and repair-loop decisions.

The typed review payload should include, per finding:

- Finding text.
- Severity or review-provided priority when available.
- Decision classification when provided by the review step.
- Affected area, file, component, symbol, or evidence when available.
- Phase identifier.
- Review run identifier.
- Project or work item identifier.
- Optional recommendation or repair guidance.
- Optional source metadata useful for timeline links or audit trails.

Markdown review summaries may still be stored or displayed in timeline history, but they must not be the canonical source for finding reconciliation or ledger persistence. The implementation should avoid brittle Markdown parsing by writing findings from the structured payload.

## Persistence Model

The implementation should add backend storage without breaking existing workflow records.

Additive SQLite persistence should include:

- A review finding ledger table that stores each finding observed during a review run.
- A finding decision table that stores explicit decisions, classifications, and resolution updates for findings.
- A repair attempt table that records each generated repair context, repair run association, and follow-up review result.
- Foreign-key or equivalent logical links to existing phase, run, and timeline records where available.
- Timestamps for creation and update events.

Each finding record should include enough information to audit and reconcile it:

- Project/work item identifier.
- Implementation phase identifier.
- Review run identifier.
- Timeline entry identifier when available.
- Finding text.
- Affected area, file, component, symbol, or evidence when available.
- Severity or review-provided priority when available.
- Stable normalized fingerprint.
- Current decision classification.
- Current resolution state.
- Created and updated timestamps.

Persistence should be implemented through a dedicated I/O adapter. Fingerprint generation, reconciliation, unresolved finding detection, and repair context selection should remain pure deterministic logic outside SQLite access.

## Finding Reconciliation

Finding reconciliation should be implemented with pure deterministic helpers.

The reconciliation contract is:

- Derive a stable normalized fingerprint from:
  - phase identifier;
  - affected area, file, component, symbol, or evidence when available;
  - severity when available;
  - normalized finding text.
- Treat matching fingerprints as the same finding candidate across review reruns.
- Apply explicit decision and resolution records after fingerprint matching.
- Preserve historical review observations even when a finding is later resolved, deferred, rebutted, or accepted as risk.
- Do not rely only on raw text equality when affected area or evidence is available.
- Keep the helpers independent from SQLite so they can be unit tested directly.

Resolution semantics:

- `blocker` and `required` findings are required-fix items while unresolved.
- `note` findings are informational unless later reclassified.
- `deferred` findings do not block completion unless refinement defines project-specific blocking rules.
- `accepted risk` findings do not block completion once the decision is explicitly recorded.
- `rebutted` findings do not block completion once the rebuttal decision is explicitly recorded.
- `follow-up` findings do not block completion unless refinement defines project-specific blocking rules.

## Repair And Review Rerun Loop

When unresolved required-fix items remain after a review run, the EPIC-008 workflow should own the repair/review loop.

The workflow should:

1. Receive the typed structured review payload.
2. Persist the review findings and decisions in the ledger.
3. Detect unresolved `blocker` and `required` findings.
4. Generate repair context containing:
   - unresolved required-fix findings;
   - phase and run identifiers;
   - relevant timeline history;
   - affected areas/evidence;
   - prior decisions and repair attempts for matching fingerprints.
5. Start or schedule the repair attempt through the EPIC-008 implementation workflow.
6. Persist the repair attempt and link it to the timeline.
7. Re-run code review after the repair attempt.
8. Append the rerun review findings to the same auditable ledger and timeline history.
9. Reconcile rerun findings against prior findings using stable fingerprints and decisions.
10. Continue until no unresolved `blocker` or `required` findings remain, or until the configured maximum attempt threshold is reached.

The loop must be bounded. When the configured maximum repair/review attempt threshold is reached and unresolved required-fix findings still remain, the workflow must stop automatic repair attempts and escalate to an explicit failed or needs-human state.

## Timeline Integration

The feature should use existing run timeline storage as the visible chronological audit trail.

Timeline history should show, in order:

- code review runs;
- structured findings captured from each review;
- decisions or resolution updates applied to findings;
- generated repair context;
- repair attempts;
- review reruns;
- final resolved, failed, or needs-human outcome.

The finding ledger remains the authoritative structured store for reconciliation, while the timeline remains the workflow-facing history.

## Acceptance Criteria

- Code-review runs expose a typed structured finding payload that is the canonical source for finding persistence.
- The implementation does not rely on Markdown parsing as the canonical source for ledger writes.
- The system persists a code-review finding ledger for each relevant implementation/review phase.
- The ledger is stored in additive SQLite tables for findings, decisions, and repair attempts.
- SQLite persistence is handled through an I/O adapter separate from pure fingerprint and reconciliation helpers.
- Each persisted finding records enough information to audit and reconcile it, including phase/run association, finding text, affected area or evidence when available, severity when available, stable fingerprint, decision classification, resolution state, and timestamps.
- Findings, decisions, and repair attempts are linked to existing run timeline entries so the timeline shows review findings, repair attempts, and review rerun results in order.
- The backend supports the decision classifications `blocker`, `required`, `note`, `deferred`, `accepted risk`, `rebutted`, and `follow-up`.
- Pure reconciliation helpers derive normalized fingerprints from phase, affected area/evidence, severity, and finding text.
- Pure reconciliation helpers can determine whether a finding is unresolved, resolved, deferred, accepted as risk, rebutted, or informational.
- Unresolved `blocker` and `required` findings are treated as required-fix items.
- Rebutted, deferred, accepted-risk, note, and follow-up findings do not block completion unless refinement defines project-specific blocking rules for them.
- When required-fix items remain after review, the workflow creates repair context containing the unresolved findings and their relevant phase/timeline context.
- After a repair attempt, the workflow re-runs code review and appends the new review results to the same auditable ledger/timeline history.
- The EPIC-008 workflow owns repair context generation, repair attempt recording, review rerun, and max-attempt escalation.
- The repair/review loop continues until no unresolved `blocker` or `required` findings remain, or until the configured maximum attempt threshold is reached.
- When the maximum attempt threshold is reached with unresolved required-fix findings, the workflow escalates to an explicit failed or needs-human state.
- Backend behavior is covered by tests for typed review payload handling, ledger persistence, finding reconciliation, unresolved required-fix detection, repair context generation, timeline integration, bounded repair loop behavior, and review rerun orchestration.
- The implementation does not add a new dashboard board.

## Validation

The FEAT scope is confirmed for refinement as a backend ledger and bounded repair-loop feature for EPIC-008. It should proceed with a typed structured review payload as the canonical finding source, additive SQLite ledger storage, a dedicated persistence adapter, pure reconciliation helpers based on stable fingerprints and explicit decisions, existing timeline integration, repair context generation, and workflow-owned bounded repair/review rerun orchestration with escalation to failed or needs-human when the configured maximum attempt threshold is reached.
