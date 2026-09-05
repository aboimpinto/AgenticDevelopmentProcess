# FEAT-063: Manual Safety Kernel For Bounded Review Recovery

**Feature ID**: FEAT-063
**Parent Epic**: EPIC-013
**Status**: Completed
**HEPHA Execution Mode:** MANUAL_BOOTSTRAP

## Summary

Implement the manually supervised, single-operator trust-root slice from EPIC-013. The kernel replaces the currently authoritative Markdown/fingerprint/progressive-retry decisions for its enabled path with structured, immutable, fail-closed governance.

## Source

- EPIC: EPIC-013 - Deterministic Review Remediation And Architecture Debt Governance
- Architecture direction: `docs/architecture/code-review-remediation-and-architecture-debt-overview.md` and `docs/architecture/code-review-remediation-and-architecture-debt-implementation-plan.md`

## Acceptance Criteria

1. A valid manifest is schema-validated, secret-safe, canonically hashed, append-only persisted, and rendered only after persistence succeeds.
2. Required findings declare disposition, defect class, root cause, inspected/affected/unaffected surface, remediation, test matrix, and exhaustiveness; invalid or unsafe content cannot influence dispatch.
3. The enabled kernel fails closed when mandatory storage, validation, or phase-gate evidence is absent.
4. The second post-fix manifestation of a defect class, or second accepted expansion, produces `REMEDIATION_REPLAN_REQUIRED` before a third narrow dispatch.
5. A developer receives only an approved bounded scope and test matrix; returns a separate immutable response/receipt; cannot alter reviewer content.
6. Untouched historical noncompliance creates minimal pending-triage architecture debt and does not block the active feature.
7. Enabling rollback stops autonomous dispatch and moves work to `needs-human`; it never restores legacy automatic authority.
8. Focused contract/integration tests, human review, and an atomic acceptance commit approve the kernel before any pilot use.

## Validation

- All implementation work is done through direct Pi agent interactions, not through autonomous implementation/recovery.
- See `FeatureTasks.md` for the implementation plan and phase task inventory.
