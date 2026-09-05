# Skill Pilot Fixtures

This directory contains fixture data for the FEAT-048 paired skill-pilot comparison engine.

The deterministic fixture definitions and shared input bundles live in:
- `apps/orchestrator/src/skill-pilot-fixtures.ts` (all 10 fixture scenarios)

These fixtures are consumed by the pure normalization adapters, comparison engine, and test layers (data-layer unit tests, business-logic parity tests, integration tests).

## Fixture Inventory

| # | Name | Expected Equivalence |
|---|------|---------------------|
| 1 | approved-review-no-findings | All equivalent |
| 2 | blocker-finding-then-repair-rerun-approved | All equivalent |
| 3 | note-only-decision | All equivalent |
| 4 | malformed-skill-blocked | Non-equivalent — skill blocked |
| 5 | absent-active-rules | Non-equivalent — skill blocked |
| 6 | receipt-field-mismatch | Non-equivalent in receipt |
| 7 | finding-classification-mismatch | Non-equivalent in findings |
| 8 | recovery-no-progress-mismatch | Non-equivalent in recovery |
| 9 | stable-ordering | All equivalent |
| 10 | legacy-non-skill-node | All equivalent |
