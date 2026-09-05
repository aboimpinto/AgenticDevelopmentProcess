# FEAT-041: Phase Task Resume Ledger

**Feature ID**: FEAT-041
**Parent Epic**: EPIC-008
**Status**: Completed

## Summary

Interpret canonical phase-task checkbox rows in `FeatureTasks.md` as a durable phase-task resume ledger. Checked canonical phase-task rows are treated as completed by default and are skipped when `continue-implementing` resumes work. Unchecked canonical phase-task rows are treated as pending. Checked tasks may be deterministically invalidated for rerun only when an explicit bounded evidence set applies, such as missing required outputs, failed or blocking phase status, or known stale artifact markers.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

FEAT-041 is a backend-only additive integration.

In scope:

- Pure ledger helpers for reading phase-task state from `FeatureTasks.md`.
- Markdown checkbox parsing for canonical phase-task rows created by refinement templates.
- Excluding prose checklists and non-canonical Markdown checkboxes from resume ledger state.
- Pending and completed task detection from canonical phase-task rows.
- Deterministic skip behavior for checked canonical tasks during `continue-implementing` resume.
- Deterministic invalidation behavior that can mark an otherwise completed task as requiring rerun when bounded invalidation evidence applies.
- An explicit invalidation evidence contract covering:
  - missing required outputs;
  - failed or blocking phase status;
  - known stale artifact markers.
- Pure selector helpers that decide skip/rerun behavior without filesystem side effects.
- An I/O adapter integrated with the existing `continue-implementing` workflow.
- Markdown parsing, ledger behavior, selector, and invalidation tests.

Out of scope:

- UI changes.
- Database or schema migrations.
- Replacing `FeatureTasks.md` as the source of phase-task resume state.
- Treating arbitrary prose checklists as phase-task resume state.
- Non-deterministic task selection or model-only decisions about whether to rerun completed work.
- Open-ended invalidation heuristics outside the documented evidence set.

## Ledger Source Contract

`FeatureTasks.md` remains the human-readable source of phase-task resume state.

Only canonical phase-task checkbox rows created by refinement templates are authoritative ledger records. The parser must ignore incidental Markdown checkboxes in prose, notes, examples, or other non-canonical checklist content.

Each parsed canonical phase-task ledger record should expose enough structured state for downstream resume decisions, including:

- task identity or stable task reference;
- phase association when present in the canonical row structure;
- checkbox completion state;
- task label or summary text;
- source location or row reference useful for diagnostics and tests.

Unchecked canonical rows are pending. Checked canonical rows are completed by default.

## Invalidation Contract

A checked canonical phase-task row may be selected for rerun only when deterministic invalidation evidence applies.

The first implementation supports a bounded evidence set:

| Evidence type | Meaning |
|---|---|
| Missing required outputs | A completed task declares or implies required outputs, but those outputs are absent. |
| Failed or blocking phase status | The related phase or task has deterministic status evidence indicating failure or blockage. |
| Known stale artifact markers | A documented stale marker indicates that a completed task's outputs are no longer valid. |

Invalidation must be explicit, testable, and deterministic. It must not depend on ad hoc LLM judgment or broad inference from arbitrary file changes.

When no invalidation evidence applies, checked canonical tasks remain completed and are skipped during resume.

## Resume Integration Boundary

The resume decision should be implemented as a pure selector plus an I/O adapter.

The pure selector is responsible for deterministic task decisions from already-loaded inputs:

- parsed ledger records;
- completion state;
- pending state;
- bounded invalidation evidence;
- selector rules for skip versus rerun.

The I/O adapter is responsible for reading `FeatureTasks.md` and collecting documented invalidation evidence from the existing `continue-implementing` workflow context. Filesystem reads should remain outside the pure decision helpers so the core behavior is easy to test.

## Acceptance Criteria

- `FeatureTasks.md` canonical phase-task checkbox rows are parsed into a durable ledger of phase tasks.
- Non-canonical prose checklists and incidental Markdown checkboxes are ignored by the resume ledger parser.
- Unchecked canonical phase-task rows are reported as pending.
- Checked canonical phase-task rows are reported as completed by default.
- `continue-implementing` skips checked canonical tasks by default when resuming a feature.
- A checked canonical task can be selected for rerun only when deterministic bounded invalidation evidence applies.
- Supported invalidation evidence includes missing required outputs, failed or blocking phase status, and known stale artifact markers.
- Invalidation behavior is explicit, testable, and does not rely on ad hoc LLM judgment.
- Resume integration is split between pure ledger/selector helpers and an I/O adapter for filesystem and workflow-context reads.
- The implementation is additive and backend-only, with no UI work or schema migration.
- Tests cover Markdown checkbox parsing, canonical row filtering, pending/completed task detection, default skip behavior, pure selector behavior, and invalidation-triggered rerun behavior.

## Validation

The feature scope is validated for refinement as a backend-only additive integration.

Refinement should plan around the resume gate, canonical ledger source contract, bounded invalidation contract, and pure selector integration boundary:

- Treat checked canonical phase-task rows as completed by default.
- Treat unchecked canonical phase-task rows as pending.
- Ignore non-canonical prose checklists and incidental Markdown checkboxes.
- Skip completed tasks during `continue-implementing` resume.
- Allow deterministic reruns only when supported invalidation evidence applies.
- Keep invalidation evidence bounded to missing required outputs, failed or blocking phase status, and known stale artifact markers for the first implementation.
- Preserve `FeatureTasks.md` as the human-readable task ledger.
- Keep filesystem reads in an adapter and skip/rerun decisions in pure helpers.

## Hepha Deep-Dive Decisions

| Topic | Decision | Detail |
|---|---|---|
| Acceptance Criteria | Resume gate and invalidation | Checked tasks are completed by default, skipped during `continue-implementing` resume, and rerun only when deterministic invalidation evidence applies. |
| Validation Scope | Backend-only additive integration | Implement pure ledger helpers, Markdown parsing tests, and an I/O adapter integrated with `continue-implementing`, with no UI or schema migration. |
| Ledger source contract | Canonical phase-task rows only | Parse only structured phase-task entries created by refinement templates; avoid accidentally treating prose checklists as resume state. |
| Invalidation evidence | Explicit bounded evidence set | Support only documented evidence types: missing required outputs, failed or blocking phase status, and known stale artifact markers. |
| Resume integration boundary | Pure selector plus I/O adapter | Add pure ledger decision helpers and keep filesystem reads in an adapter so skip/rerun behavior remains deterministic and testable. |
