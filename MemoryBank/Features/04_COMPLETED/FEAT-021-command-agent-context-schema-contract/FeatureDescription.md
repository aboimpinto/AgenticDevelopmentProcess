# FEAT-021: Command Agent Context Schema Contract

**Feature ID**: FEAT-021  
**Parent Epic**: EPIC-005  
**Status**: Completed
**Completed**: 2026-07-06

## Summary

Audit existing `.hepha` command templates, agent definitions, context packs, and schemas used by lifecycle workflows. Record which workflow nodes already reference valid assets. Implement missing contract checks and reference validation. Add focused tests for missing, invalid, or incompatible assets, and make contract errors actionable for workflow authors.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-021 is in progress on branch `feat/FEAT-021-command-agent-context-schema-contract`.

- FEAT-021 is approved as the scoped dependency bridge from FEAT-020 validator work to FEAT-022 and FEAT-024.
- The feature validates workflow asset references only.
- The implementation should audit current `.hepha` command, agent, context-pack, and schema references before adding new checks.
- Only missing validation gaps should be implemented.
- Contract errors must be actionable and identify the source path plus the relevant workflow node or asset id.
- Receipts, state-machine recovery, hashing, and dual-layout migration are explicitly out of scope for this FEAT.

## Scope

FEAT-021 covers command-agent-context schema contract validation for lifecycle workflow assets.

In scope:

- Audit existing `.hepha` command template references.
- Audit existing agent definition references.
- Audit existing context-pack references.
- Audit existing schema references.
- Record which workflow nodes already reference valid assets.
- Identify validation gaps left after FEAT-020.
- Implement missing asset reference validation checks only.
- Report actionable contract errors for missing, invalid, or incompatible assets.
- Add focused tests for missing, invalid, and incompatible asset references.

Out of scope:

- Receipt generation or receipt validation.
- State-machine recovery behavior.
- Hashing or content-addressing changes.
- Dual-layout migration.
- Broad workflow execution changes unrelated to asset reference validation.

## Acceptance Criteria

- Existing `.hepha` command templates, agent definitions, context packs, and schemas used by lifecycle workflows are audited.
- Workflow nodes that already reference valid assets are recorded or documented in the relevant validator/test coverage.
- Missing validation gaps for command, agent, context-pack, and schema references are implemented.
- Validation fails when a workflow references a missing asset.
- Validation fails when a workflow references an invalid asset.
- Validation fails when a workflow references an incompatible asset for the intended node or contract.
- Contract errors include enough information for workflow authors to fix the issue, including:
  - source path;
  - workflow node id or asset id;
  - the missing, invalid, or incompatible reference;
  - a concise explanation of the expected contract.
- Focused tests cover missing, invalid, and incompatible asset references.
- The implementation remains limited to asset reference validation and does not introduce receipt, recovery, hashing, or dual-layout migration behavior.

## Validation

FEAT-021 is confirmed as a scoped dependency bridge from FEAT-020 validator work to FEAT-022 and FEAT-024. Refinement should proceed with asset reference validation as the only implementation scope.
