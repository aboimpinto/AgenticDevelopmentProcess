# FEAT-022: Minimum Viable Run Receipts And Output Gates

**Feature ID**: FEAT-022
**Parent Epic**: EPIC-005
**Status**: Completed

## Summary

Audit current SQLite workflow metadata, prompt logs, console logs, Pi stream summaries, and generated artifacts to record what receipt-like evidence already exists. Extend the existing SQLite workflow run model with minimal receipt fields and references for artifacts, selected context, context hashes, command results, gates, status, and next state. Add deterministic pure/path-aware receipt validation and call it before orchestrator-managed state transitions so workflow cards cannot advance when required stage-specific evidence is missing or invalid.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Started: 2026-07-07
- Completed: 2026-07-07
- Branch: feat/FEAT-022-minimum-viable-run-receipts-and-output-gates

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
| --- | --- | --- |
| Acceptance criteria | MVP receipt contract with transition gates | Audit existing evidence, add the minimum required receipt fields, validate them with pure/path-aware checks, and block state transitions when required fields are missing or invalid. |
| Validation scope | Confirm EPIC-005 MVP boundary | Keep scope to auditable receipts and gate validation for existing workflow metadata/assets. Avoid runner execution rewrites unless a closure-blocking gap is found. |
| Receipt source of truth | Extend existing workflow run metadata | Add minimal receipt fields and references to the current SQLite workflow run model while reusing prompt logs, console logs, stream summaries, and artifacts. |
| Gate strictness | Stage-specific required fields | Define required fields per workflow stage. Require command results only when commands ran, and require console evidence only when available for that run type. |
| Implementation boundary | Pure/path-aware validator plus transition hook | Implement deterministic receipt checks with source-path and identifier-aware errors, then call them before orchestrator-managed state transitions. |

## Scope

FEAT-022 covers the minimum viable receipt and output-gate layer needed for EPIC-005 closure:

- Audit current receipt-like evidence already produced by Hepha and Pi runs.
- Identify which existing SQLite fields, prompt logs, console logs, Pi stream summaries, and generated artifacts can be referenced as receipt evidence.
- Extend the existing SQLite workflow run model as the source of truth for MVP receipt metadata and external evidence references.
- Define and implement the minimum required receipt shape for workflow run auditing.
- Persist or derive required receipt fields from existing workflow metadata and assets where practical.
- Define stage-specific required fields so validation is strict for the current workflow stage without requiring evidence that cannot exist for a given run type.
- Validate receipt completeness before orchestrator-managed workflow state transitions.
- Block state transitions when required receipt evidence is missing, malformed, incompatible with the requested transition, or points to unavailable artifacts.
- Return actionable validation errors that identify the missing or invalid field and, where applicable, the source path or identifier involved.
- Keep validation deterministic, testable, and safe to run without executing agents or rewriting the runner lifecycle.

## Non-Goals

- Rewriting the Pi runner execution model.
- Replacing existing prompt, console, or stream logging systems.
- Building a full provenance or compliance framework beyond the EPIC-005 MVP.
- Adding broad workflow automation beyond receipt validation and transition gating.
- Introducing new runner execution behavior unless a closure-blocking gap is discovered during the evidence audit.
- Requiring command results for stages where no commands were executed.
- Requiring console or stream evidence for run types where that evidence is not produced or available.

## Receipt Source Of Truth

The MVP receipt contract lives in the existing SQLite workflow run metadata.

The SQLite workflow run model should store the minimal receipt fields needed for transition validation and should reference existing evidence assets rather than duplicating them. Prompt logs, console logs, Pi stream summaries, generated artifacts, and related files remain external evidence sources referenced by the run receipt.

The receipt model should therefore support:

- Stable run identity fields.
- Stage and workflow status fields.
- References to selected context entries.
- Hashes for file-based selected context.
- References to saved prompt or instruction files.
- References to console logs, Pi stream summaries, or equivalent execution evidence when available.
- References to generated artifacts and expected output files.
- Command result summaries when commands were executed.
- Gate results and failure reasons.
- Intended next workflow state.

## Minimum Viable Receipt Fields

A workflow run receipt must provide enough evidence to explain what was attempted, what context was used, what outputs were produced, and whether the run is allowed to advance state.

Required MVP fields:

| Field | Purpose |
| --- | --- |
| Run identity | Identify the workflow run, work item, project, stage, and timestamp. |
| Selected context | Record the source documents, prompts, task inputs, or MemoryBank files selected for the run. |
| Context hashes | Provide stable hashes for file-based selected context so later changes can be detected. |
| Prompt or instruction reference | Link to the prompt log or saved instruction used by the run. |
| Console or stream evidence | Link to console logs, Pi stream summaries, or equivalent execution evidence when available for the run type. |
| Generated artifacts | Record files or outputs produced by the run, including paths and expected existence. |
| Command results | Record relevant command names, exit codes, and output/log references when validation commands are run. |
| Gates | Record required output gates, their pass/fail state, and failure reason when blocked. |
| Status | Record the resulting workflow status for the run. |
| Next state | Record the intended next workflow state when gates pass. |

## Stage-Specific Gate Strictness

Receipt validation must be stage-specific.

The validator should require only the evidence that is mandatory for the workflow stage and run type being transitioned. Evidence that was not produced and is not required for the stage must not block the transition.

Stage-specific rules:

- Run identity, work item identity, workflow stage, status, and next state are always required.
- Selected context is required when the stage uses source documents, prompts, task inputs, MemoryBank files, or stored metadata as input.
- Context hashes are required for file-based selected context.
- Prompt or instruction references are required for agent-backed runs or saved instruction-driven workflow actions.
- Console or stream evidence is required only when available for the run type.
- Generated artifacts are required only when the stage claims to have produced files or outputs.
- Command results are required only when validation, build, test, lint, format, or other commands were executed.
- Gate results are required for any transition that depends on output validation.
- Failure reasons are required for blocked gates or blocked transitions.

## Output Gates

State transitions must be blocked when required receipt evidence is missing or invalid for the current workflow stage.

Minimum gates:

- Required receipt fields are present for the workflow stage being transitioned.
- Referenced files or artifacts exist when the receipt claims they were produced.
- Selected context entries are resolvable to known files, prompts, or stored metadata.
- Context hashes are present for file-based selected context.
- Command results include exit status when commands were executed.
- Console or stream evidence references are valid when that evidence is available and required for the run type.
- Gate results include clear pass/fail status and failure reason for blocked transitions.
- The receipt status and next state are compatible with the requested workflow transition.
- Validation failures are reported in a form that can be shown to the user and used by downstream recovery loops.

## Validation Design

Receipt validation should be implemented as deterministic pure or path-aware checks.

The validation layer should:

- Accept receipt metadata, workflow stage, requested transition, and path resolution context as inputs.
- Avoid running agents or commands.
- Avoid mutating workflow state during validation.
- Check required fields according to the stage-specific receipt contract.
- Resolve file and artifact references using path-aware checks.
- Validate identifiers for runs, work items, projects, stages, gates, and command results.
- Return structured pass/fail results.
- Return actionable errors that include the invalid field, reason, and source path or identifier when applicable.
- Be callable from tests without requiring a running Pi process or workflow runner.
- Be called by the orchestrator before managed state transitions are persisted.

## Transition Hook

The orchestrator-managed state transition path must call receipt validation before moving a workflow card to the next state.

The transition hook should:

1. Load the workflow run receipt metadata from SQLite.
2. Determine the current workflow stage and requested next state.
3. Resolve the stage-specific required receipt fields.
4. Run the deterministic receipt validator.
5. Allow the transition only when all required gates pass.
6. Block the transition when validation fails.
7. Return actionable failure reasons suitable for UI display and recovery planning.
8. Preserve the blocked transition result for auditability where practical.

## Acceptance Criteria

- Existing receipt-like evidence is audited across SQLite workflow metadata, prompt logs, console logs, Pi stream summaries, and generated artifacts.
- The audit records which evidence already exists, where it is stored, and which MVP receipt fields are missing.
- The existing SQLite workflow run model is extended as the source of truth for minimal receipt fields and references.
- A minimum viable receipt contract is defined for workflow runs, covering artifacts, selected context, context hashes, command results, gates, status, and next state.
- Required receipt fields are defined per workflow stage and run type.
- Command results are required only when commands were executed.
- Console or stream evidence is required only when available for the run type and required by the stage.
- Receipt validation is implemented with deterministic pure or path-aware checks that do not require rerunning agents.
- Receipt validation returns source-path and identifier-aware errors for missing, malformed, incompatible, or unavailable evidence.
- State transition logic calls receipt validation before allowing workflow cards to move to the next state.
- Transitions are blocked when required receipt fields are missing, malformed, incompatible with the requested transition, or reference unavailable artifacts.
- Blocked transitions return actionable failure reasons suitable for UI display and recovery planning.
- Existing workflow metadata and assets are reused where practical instead of introducing duplicate logging systems.
- Tests cover valid receipts, missing required fields, invalid artifact paths, missing context hashes, command results required only when commands ran, console evidence required only when available for the run type, failed gates, and blocked state transitions.
- The implementation stays within the EPIC-005 MVP boundary and does not rewrite runner execution unless an audit-discovered gap blocks closure.

## Validation

This FEAT is confirmed against the EPIC-005 MVP boundary. Refinement should focus on auditable run receipts and output-gate validation for existing workflow metadata and assets.

Implementation planning should explicitly verify whether any runner execution change is truly required. If the audit shows that existing prompt logs, console logs, Pi stream summaries, generated artifacts, and SQLite metadata can satisfy the MVP receipt contract, runner execution rewrites should remain out of scope.
