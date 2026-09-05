# FEAT-030: Approval Gates API And Dashboard UX

**Feature ID**: FEAT-030
**Parent Epic**: EPIC-006
**Status**: Completed

## Summary

Create approval request records for approval-required policy decisions. Show pending approvals in the dashboard. Support approve, deny, and timeout/fail decisions. Resume or fail workflow based on the approval decision. Require approval for policy decisions covering remote writes, destructive filesystem commands, privileged commands, and PR actions. Allow policy-approved local edits and tests without approval.

This feature is a narrow approval gateway MVP. It uses FEAT-027 path policy and FEAT-028/FEAT-029 command policy decisions as inputs, adds durable approval request state, pure approval-state resolution, API/UI wiring, deterministic timeout handling, and audit receipt/history evidence. Detailed git write guardrails are deferred to FEAT-031.

## Source

- EPIC: EPIC-006 - Safety Tool Profiles And Approval Gates
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance criteria | Use the narrow approval gateway MVP: approval records, pending-approval dashboard/API, approve/deny/timeout outcomes, workflow resume/fail handling, audit receipt/history evidence, and no-approval flow for policy-approved local edits/tests. |
| Validation | Confirm scope as bounded integration on existing policies: use FEAT-027 path policy and FEAT-028/FEAT-029 command decisions as inputs, add pure approval-state resolution, optional shared/receipt fields, API/UI wiring, and deterministic timeout tests. |
| Approval state boundary | Use a persistent approval store as the source of truth. Create durable approval records tied to workflow/run/action context, and use a pure approval-state resolver for approve, deny, timeout, and no-approval paths. |
| Timeout behavior | Store timeout deadlines and evaluate timeout with an injected clock in pure tests, API reads/resolves, and workflow resume checks. |
| Policy integration scope | Consume approval-required path and command decisions only. FEAT-030 creates approvals only for approval-required decisions from FEAT-027, FEAT-028, and FEAT-029; policy-allowed local edits/tests proceed without approval records. |
| Deferred scope | Defer detailed git write guardrails to FEAT-031. |

## Acceptance Criteria

- Approval-required policy decisions create persistent approval request records.
- Approval records include enough context for review, including workflow/run reference, requested action, policy reason, target resource or command summary, requested timestamp, status, and timeout deadline when applicable.
- The persistent approval store is the source of truth for pending, approved, denied, and timed-out approval state.
- Approval records are tied to workflow/run/action context so the waiting workflow or command flow can be resumed or failed deterministically.
- Approval-state resolution is pure and testable independently from dashboard rendering, API transport, or workflow execution.
- The approval-state resolver supports approve, deny, timeout, and no-approval paths.
- The dashboard shows pending approval requests in a clear review queue.
- An API supports listing pending approvals.
- An API supports resolving an approval request with approve or deny decisions.
- Approved requests resume the waiting workflow or command flow deterministically.
- Denied requests fail or block the waiting workflow with a clear denial result.
- Timed-out approval requests fail deterministically and leave auditable evidence.
- Timeout deadlines are stored on approval records when applicable.
- Timeout evaluation uses an injected clock in pure tests, API reads/resolves, and workflow resume checks.
- Policy-approved local edits and tests continue without creating approval requests.
- Approval history or receipt evidence records request creation, final outcome, timestamps, and decision source.
- Shared receipt/history fields are additive and optional where needed to avoid blocking adjacent policy work.
- Tests cover approve, deny, timeout/fail, and no-approval paths.
- Tests use FEAT-027 path policy and FEAT-028/FEAT-029 command policy outcomes as integration inputs.
- Detailed git write guardrails are not implemented in this feature and remain part of FEAT-031.

## Functional Scope

FEAT-030 owns the approval gateway layer between policy decisions and workflow execution.

Included:

- Durable approval request records.
- Pending approval dashboard queue.
- Approval listing API.
- Approval resolution API for approve and deny decisions.
- Pure resolver for approval state transitions.
- Deterministic timeout/fail behavior.
- Workflow resume/fail handling based on final approval outcome.
- Audit receipt/history evidence for request creation and final outcome.
- Integration with approval-required policy outcomes from FEAT-027, FEAT-028, and FEAT-029.
- No-approval pass-through for policy-approved local edits and tests.

Excluded:

- Redesigning path policy.
- Redesigning command policy.
- Implementing detailed git write guardrails.
- Expanding approval handling beyond approval-required path and command decisions.
- Treating allowed local edits/tests as approval requests.

## Approval State Model

The approval store is the source of truth for approval requests and final outcomes.

Approval records should support at least:

| Field | Purpose |
| --- | --- |
| Approval ID | Stable identifier for API/UI/workflow references. |
| Workflow/run reference | Identifies the workflow, run, or command flow waiting on approval. |
| Requested action | Human-readable action being reviewed. |
| Policy reason | Explanation from the policy decision that required approval. |
| Target resource or command summary | Path, command, PR action, or other concise review target. |
| Requested timestamp | When the approval request was created. |
| Status | Pending, approved, denied, timed out, or equivalent internal states. |
| Timeout deadline | Optional deadline used for deterministic timeout checks. |
| Decision source | User/API/system timeout source of the final decision. |
| Final outcome timestamp | When the request reached its final state. |
| Receipt/history reference | Optional additive evidence for audit trails. |

## Approval Resolution Rules

The approval resolver should be pure and deterministic.

Resolution paths:

| Input | Expected outcome |
| --- | --- |
| Approval-required policy decision | Create or reference a persistent pending approval request. |
| Approve decision | Mark approval as approved and return a resume outcome for the waiting workflow/command flow. |
| Deny decision | Mark approval as denied and return a fail/block outcome with a clear denial result. |
| Expired timeout deadline | Mark approval as timed out and return a deterministic fail outcome. |
| Policy-approved local edit/test | Return no-approval/pass-through outcome without creating an approval record. |

Timeout handling must use an injected clock so tests, API reads/resolves, and workflow resume checks can evaluate deadlines consistently.

## Policy Integration

Implementation planning should assume:

- FEAT-027 provides path policy and workspace boundary decisions.
- FEAT-028 and FEAT-029 provide command policy gateway decisions.
- FEAT-030 consumes approval-required path and command decisions only.
- FEAT-030 creates approval records only when those upstream policy decisions require approval.
- FEAT-030 allows policy-approved local edits and tests to proceed without approval records.
- FEAT-030 should not redesign path policy, command policy, or detailed git write guardrails.

## Dashboard And API UX

The dashboard should provide a clear pending-approval review queue.

Each pending approval should show enough context for a safe decision:

- Workflow/run reference.
- Requested action.
- Policy reason.
- Target resource or command summary.
- Requested timestamp.
- Timeout deadline when applicable.
- Available approve/deny actions.

The API should support:

- Listing pending approvals.
- Resolving an approval request as approved.
- Resolving an approval request as denied.
- Returning final approval status and audit-relevant evidence.
- Handling timeout checks deterministically when approvals are read, resolved, or checked by workflow resume logic.

## Validation

FEAT-030 scope is confirmed for refinement as a bounded integration on existing policy work.

Implementation planning should assume:

- FEAT-027 provides path policy and workspace boundary decisions.
- FEAT-028 and FEAT-029 provide command policy gateway decisions.
- FEAT-030 owns approval request state, approval resolution outcomes, dashboard/API wiring, timeout handling, and audit evidence.
- FEAT-030 uses a persistent approval store with a pure resolver as the approval source of truth.
- FEAT-030 evaluates timeouts through stored deadlines and an injected clock.
- FEAT-030 consumes approval-required path and command decisions only.
- FEAT-030 should not redesign path policy, command policy, or detailed git write guardrails.
- Deterministic timeout behavior is required before the feature can be considered complete.
