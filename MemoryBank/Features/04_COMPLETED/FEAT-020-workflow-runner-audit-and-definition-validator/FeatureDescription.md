# FEAT-020: Workflow Runner Audit And Definition Validator

**Feature ID**: FEAT-020  
**Parent Epic**: EPIC-005  
**Status**: Completed

## Summary

Audit the existing `.workflows/*.workflow.yaml` loader and validator. Record which workflow definition rules are already implemented, then fix only verified validator gaps such as duplicate or conflicting definitions and missing required fields. Expose the validated workflow shape to the orchestrator and dashboard, and harden the behavior with focused tests.

## Source

- EPIC: EPIC-005 - Native Harness And Workflow Runner
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-020 uses an **audit-first validator hardening** contract.
- The work must begin by inventorying current `.workflows` loader and validator behavior.
- Implementation must only address verified validation gaps.
- This FEAT must not introduce new workflow runner behavior.
- Deferred gaps must be recorded with clear follow-up steps for later FEATs.

## Scope

FEAT-020 covers:

1. Auditing the existing workflow definition loader for `.workflows/*.workflow.yaml`.
2. Auditing current validation rules and recording what is already enforced.
3. Identifying precise validation gaps.
4. Fixing only confirmed gaps, especially:
   - missing required workflow fields;
   - duplicate workflow definitions;
   - conflicting workflow definitions;
   - invalid or ambiguous workflow shape that the current loader accepts incorrectly.
5. Exposing the validated workflow shape for orchestrator and dashboard use.
6. Adding or hardening focused tests around existing and newly verified behavior.

## Out Of Scope

FEAT-020 does not include:

- adding new workflow runner execution behavior;
- changing workflow lifecycle semantics beyond validation requirements;
- introducing new workflow authoring features;
- redesigning the workflow schema beyond the minimum needed to document and enforce existing expectations;
- implementing broad dashboard UI changes beyond consuming or displaying the exposed workflow shape where already appropriate.

## Acceptance Criteria

- The existing `.workflows/*.workflow.yaml` discovery, loading, and validation flow is audited.
- A concise inventory documents which workflow definition rules are already implemented.
- The inventory distinguishes between:
  - rules already enforced;
  - rules partially enforced;
  - verified gaps;
  - deferred or intentionally unsupported rules.
- Missing required fields are validated with clear, actionable error messages.
- Duplicate workflow definitions are detected and rejected.
- Conflicting workflow definitions are detected and rejected when they would produce ambiguous orchestrator behavior.
- The validated workflow shape is available to the orchestrator in a typed or otherwise explicit structure.
- The dashboard can access the workflow shape needed to inspect or present available workflows.
- Existing behavior is preserved unless a verified validator gap requires correction.
- Focused tests cover:
  - valid workflow definitions;
  - missing required fields;
  - duplicate definitions;
  - conflicting definitions;
  - existing validator behavior captured during the audit.
- Any validator gaps not fixed in this FEAT are documented with exact follow-up steps.

## Validation

Refinement should confirm FEAT-020 as an EPIC-005 audit-first hardening FEAT.

Before implementation planning, refinement must produce:

- a precise list of existing loader and validator behavior;
- a scoped list of validator gaps selected for this FEAT;
- a list of deferred gaps with follow-up recommendations;
- confirmation that no new runner behavior is required;
- confirmation that planned changes are limited to validator hardening, workflow shape exposure, documentation, and focused tests.

## Refinement Notes

During refinement, inspect the current workflow loader, validator, workflow schema assumptions, orchestrator integration points, dashboard integration points, and existing tests before creating implementation tasks. The resulting task plan should keep audit, documentation, validator fixes, shape exposure, and tests separate enough for clear review.
