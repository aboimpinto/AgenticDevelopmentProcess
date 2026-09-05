# FEAT-031: Git Write Guardrails

**Feature ID**: FEAT-031  
**Parent Epic**: EPIC-006  
**Status**: Completed

## Summary

Gate branch changes, commits, pushes, `gh` PR creation, and `gh` PR-changing actions through workflow state and approval policy when those commands are routed through the Hepha command gateway.

Safe local repository inspection and policy-approved local status checks must remain available without approval. Remote writes and PR actions require explicit approval. The workflow surface must show dirty repository state and pending remote/PR actions. Git guardrail decisions should be recorded in receipts through optional evidence fields while preserving backward compatibility.

FEAT-031 implements the bounded git write guardrail slice. The Approval Gates API And Dashboard UX dependency (FEAT-030) was completed before FEAT-031 implementation began, enabling real integration tests.

## Source

- EPIC: EPIC-006 - Safety Tool Profiles And Approval Gates
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-031 remains in Deep-Dive/In Progress until the Approval Gates API And Dashboard UX dependency is complete and integration-testable.
- Refinement, design, and implementation planning must not start until that dependency can support real approval integration tests.
- FEAT-031 implements a bounded guardrail slice for gateway-routed git and `gh pr` commands.
- FEAT-031 classifies and enforces git plus `gh pr` commands routed through the command gateway, without building a full git client.
- Command classification must use deterministic pure allowlisted action classifiers for supported git and `gh pr` operations.
- Git/PR guardrail enforcement must be composed after existing command safety gates while preserving command-policy precedence.
- FEAT-031 extends workflow state, shared types, and receipts with optional git guardrail evidence.
- Dirty state, pending actions, approval references, and receipt evidence must be additive optional fields.
- Existing workflow records, receipt formats, and receipt consumers must remain backward-compatible when git guardrail fields are absent.
- FEAT-031 should not rebuild the approval UX.

## Dependency Readiness Requirement

Refinement, design, and implementation planning must not start until the Approval Gates API And Dashboard UX feature is complete and available for real integration testing.

The dependency must provide:

- approval request creation for guarded actions;
- approval resolution for pending actions;
- dashboard/workflow UX capable of displaying approval-required actions;
- integration points that FEAT-031 can use for real command-gateway approval tests.

FEAT-031 integrates with that dependency. It does not recreate approval request handling, approval decision UI, or dashboard approval workflows locally.

If the dependency is not ready, FEAT-031 must remain in Deep-Dive/In Progress and must not move to refinement.

## Scope

FEAT-031 covers git safety guardrails for Hepha-managed workflows.

Included:

- Classify gateway-routed git and `gh pr` commands as inspection, local mutation, remote write, or PR action.
- Use deterministic pure allowlisted classifiers for supported git and `gh pr` actions.
- Allow safe local repository inspection without approval.
- Allow policy-approved local status checks without approval.
- Gate branch-changing commands, commits, pushes, and PR creation through workflow state and policy.
- Require explicit approval for remote writes and PR actions.
- Display repository dirty state and pending remote/PR actions in the workflow surface.
- Extend workflow state and shared types with optional git guardrail fields for dirty state, pending actions, and approval references.
- Record git guardrail decisions in receipts through optional evidence fields when receipt evidence is available.
- Add backward-compatible tests for old workflow records and receipts without git guardrail fields.

Out of scope:

- Rebuilding the Approval Gates dashboard UX.
- Replacing the existing approval-gates dependency.
- Implementing a full git client or branch-management UI.
- Guarding git or PR actions that bypass the Hepha command gateway.
- Changing repository hosting provider integrations beyond the guarded command/PR actions needed for this feature.

## Guarded Action Boundary

FEAT-031 guards commands routed through the Hepha command gateway.

Guarded command families include:

- `git` commands that inspect, mutate, commit, or write repository state;
- `gh pr` commands that create or change pull requests.

The feature must classify and enforce these command families without attempting to become a full git client. Commands executed outside the Hepha command gateway are outside this bounded slice.

## Guardrail Enforcement Architecture

FEAT-031 should extend the existing command gateway rather than introducing a separate git execution path.

The enforcement model should be:

1. Commands enter through the existing Hepha command gateway.
2. Existing command safety gates and command-policy precedence remain authoritative.
3. Pure allowlisted git and `gh pr` classifiers identify whether the command is inspection, local mutation, remote write, or PR action.
4. Git guardrail policy evaluates the classified action against workflow state and approval requirements.
5. The command gateway either:
   - allows the command to execute;
   - creates or references a pending approval action through the Approval Gates dependency;
   - blocks execution with actionable feedback.

The classifiers should be pure and covered by focused tests. They should not execute git, call GitHub, mutate workflow state, or create approvals directly.

## Git Action Policy

| Action Type | Examples | Approval Requirement | Notes |
|---|---|---:|---|
| Repository inspection | `git status`, `git diff`, `git log`, branch/list checks | No approval | Must remain available for planning, review, and diagnostics. |
| Local status checks | Policy-approved commands that inspect local state | No approval | Must not mutate local or remote repository state. |
| Local branch changes | checkout/switch, branch creation, merge/rebase/reset when routed through Hepha | Policy-gated | Must be checked against current workflow state before execution. |
| Commit creation | `git commit` and equivalent commit-producing flows | Policy-gated | Must require valid workflow state and clean approval policy result. |
| Remote writes | `git push`, force push, tag push, remote branch deletion | Approval required | Must produce a pending action before execution. |
| PR actions | `gh pr create` and PR-changing `gh pr` actions routed through the command gateway | Approval required | Approval UX is provided by the dependency, not rebuilt here. |

## Workflow State And Receipt Model

FEAT-031 should add optional git guardrail fields to workflow state, shared types, and receipts.

Workflow state should be able to expose:

- current dirty repository state;
- pending remote-write actions;
- pending PR actions;
- approval status for pending git/PR actions where available;
- approval identifiers or decision references where available.

Receipts should be able to include optional git guardrail evidence, such as:

- classified action type;
- policy decision;
- workflow-state check result;
- approval requirement;
- approval identifier or decision reference when available;
- blocked-action reason when an action is denied before execution.

Receipt and state compatibility rules:

- Existing workflow records must remain valid.
- Existing receipt formats must remain valid.
- Existing receipt consumers must continue working when git guardrail evidence is absent.
- Git guardrail evidence must be additive and optional.
- Dirty state, pending actions, and approval references must not become mandatory fields for older workflow records or receipts.
- Tests must explicitly cover old records and receipts without the new optional fields.

## Acceptance Criteria

- Pure git action policy exists and can classify supported gateway-routed git operations into inspection, local mutation, remote write, and PR action categories.
- Pure action policy exists for supported gateway-routed `gh pr` commands.
- Git and `gh pr` classifiers use deterministic pure allowlisted action classification.
- Git and `gh pr` classifiers are pure, deterministic, and independently testable.
- Command-gateway enforcement prevents guarded git and `gh pr` operations from bypassing policy evaluation when routed through Hepha.
- Git/PR guardrail enforcement is composed into the existing command gateway after existing safety gates while preserving command-policy precedence.
- Workflow-state checks are applied before branch changes, commits, remote writes, and PR actions.
- Local repository inspection and policy-approved local status checks remain available without approval.
- Remote writes require explicit approval before execution.
- PR creation and PR-changing actions routed through Hepha require explicit approval before execution.
- The dashboard or workflow state surface shows:
  - current dirty repository state;
  - pending remote-write actions;
  - pending PR actions.
- Blocked git or PR actions return actionable feedback explaining the policy reason and required next step.
- Approved git and PR actions can be executed through the command gateway without requiring a second unrelated approval.
- Git guardrail decisions are recorded in receipts through optional git guardrail evidence when receipt evidence is available.
- Existing workflow records remain backward-compatible when git guardrail fields are absent.
- Existing receipt consumers remain backward-compatible when git guardrail evidence is absent.
- The feature integrates with the completed Approval Gates API And Dashboard UX dependency instead of recreating approval UX locally.
- Refinement, design, and implementation planning remain blocked until the dependency is complete and real integration tests can be planned.

## Validation

Implementation planning may proceed only after the Approval Gates API And Dashboard UX dependency is complete and available for real integration tests.

Validation plan:

- Add pure evaluator tests for git action classification and approval requirements.
- Add pure evaluator tests for `gh pr` command classification and approval requirements.
- Add evaluator tests for deterministic pure allowlisted git and `gh pr` classifiers.
- Add evaluator tests for allowed local inspection commands and blocked mutation commands.
- Add command-gateway integration tests proving guarded git operations cannot bypass policy.
- Add command-gateway integration tests proving guarded `gh pr` operations cannot bypass policy.
- Add integration tests proving git/PR guardrail enforcement preserves existing command-gateway safety gate precedence.
- Add workflow-state tests for branch changes, commits, remote writes, and PR actions.
- Add workflow-state/shared-type compatibility tests for records without git guardrail fields.
- Add dashboard/state tests for dirty-state display and pending remote/PR action display.
- Add approval integration tests for remote writes and PR actions using the completed Approval Gates API And Dashboard UX dependency.
- Add backward-compatible receipt tests covering:
  - receipts with git guardrail evidence;
  - receipts without git guardrail evidence;
  - blocked-action receipt behavior where applicable.
