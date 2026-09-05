# FEAT-010: Batch Creation Preview And Explicit Apply Contract

**Feature ID**: FEAT-010  
**Parent Epic**: EPIC-003  
**Status**: Completed

## Summary

Implement the deterministic batch creation preview/apply boundary for EPIC lifecycle automation. The feature must build a stable preview plan that shows intended child FEAT folder creation, EPIC table updates, backlinks, diagram/progress changes, dependency data, priority data, and EPIC-order gaps, then require one explicit user confirmation before any filesystem writes occur.

If the user cancels or does not confirm, the filesystem remains untouched.

## Source

- EPIC: EPIC-003 - EPIC Lifecycle Automation
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Scope confirmation | Refine FEAT-010 as the batch preview/apply boundary. |
| Dependency handling | Include FEAT-009 dependency information in the preview plan. |
| Priority handling | Include child FEAT priority data in the preview plan. |
| EPIC-order gaps | Detect and show EPIC ordering gaps in the preview plan. |
| Deferred scope | Defer duplicate-safe/idempotent EPIC document rewriting to FEAT-011. |

## Scope

FEAT-010 covers the preview/apply contract for batch FEAT creation from an EPIC document.

The implementation should produce a deterministic plan before writing anything. The plan should be suitable for user review, downstream refinement, design decisions, and implementation planning.

The preview should include:

- Child FEAT folders that would be created.
- Child FEAT documents that would be written.
- EPIC table updates that would be applied.
- Backlinks between child FEATs and the parent EPIC.
- Mermaid diagram or progress/status changes that would be applied.
- FEAT-009 dependency information required by the generated child FEATs.
- Priority data for generated child FEATs.
- EPIC ordering gaps or inconsistencies that affect the batch plan.

## Explicit Apply Contract

Batch creation must follow this contract:

1. Read and analyze the EPIC input.
2. Build a deterministic preview plan.
3. Present the preview plan to the user.
4. Wait for explicit confirmation.
5. Apply writes only after confirmation.
6. Perform no writes if the user cancels, rejects, or exits before confirmation.

Cancellation must leave the filesystem unchanged, including:

- No child FEAT folders.
- No child FEAT Markdown files.
- No EPIC document changes.
- No partial table, backlink, diagram, or progress updates.

## Out Of Scope

The following work is intentionally deferred to FEAT-011:

- Duplicate-safe EPIC rewriting.
- Idempotent EPIC document rewrite behavior.
- Re-running the same apply operation safely against already-updated EPIC Markdown.
- General-purpose document rewrite deduplication beyond the preview/apply boundary.

## Acceptance Criteria

- Batch creation has a preview-only phase with no file writes.
- The preview plan is stable for the same EPIC input.
- The preview plan includes intended child FEAT folders, FEAT documents, EPIC table updates, backlinks, diagram/progress changes, dependency data, priority data, and EPIC-order gaps.
- Writes occur only after explicit user confirmation.
- Cancelling the preview performs no child FEAT or EPIC document changes.
- FEAT-009 dependency information is represented in the preview plan where relevant.
- Duplicate-safe/idempotent EPIC rewriting is not implemented in this FEAT and remains assigned to FEAT-011.

## Validation

Scope confirmed through Deep-Dive: implement deterministic preview, explicit confirmation/cancel behavior, and dependency/priority/order data in the plan; defer duplicate-safe document rewriting to FEAT-011.

## CodeWhale EPIC Reference

- **EPIC-002 / Layer 5.1**: Batch Creation Preview And Explicit Apply Contract.
- **CodeWhale Issue**: [Hmbown/CodeWhale#2870](https://github.com/Hmbown/CodeWhale/issues/2870) — EPIC: staged command-boundary refactor.
- **PR**: Completed through Hepha FEAT-010. See `completion-report.md` for implementation details.
