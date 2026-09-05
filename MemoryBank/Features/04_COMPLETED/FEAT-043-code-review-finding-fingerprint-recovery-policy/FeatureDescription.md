# FEAT-043: Code Review Finding Fingerprint Recovery Policy

**Feature ID**: FEAT-043  
**Parent Epic**: EPIC-008  
**Status**: Completed

## Summary

Replace flat code-review retry count with fingerprint-based progress detection. Normalize review findings into stable fingerprints, compare the current unresolved finding set against the latest prior snapshot for the same feature, phase, and review gate, classify progress, and continue recovery while unresolved findings are demonstrably changing or shrinking.

The recovery loop must stop only when identical unresolved fingerprints repeat without progress, when the review explicitly returns `BLOCKED`, or when the review is approved. Decisions and fingerprint evidence must be recorded in workflow history for auditability.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.
- Builds on FEAT-042 finding ledger behavior as an additive backend policy extension.

## Scope

FEAT-043 is a backend recovery-policy feature. It should use the finding ledger from FEAT-042 and add deterministic recovery decisions based on normalized finding fingerprints.

### In Scope

- Deterministic finding fingerprint normalization.
- Stable fingerprint contract based on structured canonical finding fields.
- Progress classification for review recovery attempts.
- Continue/stop decision helpers for unresolved findings.
- Comparison against the latest same-gate prior snapshot.
- Adapter wiring so the code-review recovery loop uses fingerprint-based decisions.
- Additive metadata in workflow history for auditability.
- Focused regression tests for normalization, progress classification, and recovery stop/continue behavior.

### Out of Scope

- UI changes.
- Delivery-policy changes unrelated to code-review recovery.
- Replacing the FEAT-042 finding ledger.
- Broad implementation workflow redesign beyond the backend fingerprint recovery policy.
- Broad history analysis across unrelated features, phases, or review gates.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance Criteria | Implement deterministic finding fingerprint normalization, progress classification, continue/stop decisions, workflow-history evidence, and focused tests. Keep UI and delivery-policy changes out of scope. |
| Validation | Treat FEAT-043 as an additive FEAT-042 follow-up: a backend policy extension built on the FEAT-042 finding ledger, using pure decision helpers, explicit adapter wiring, additive metadata, and regression tests. |
| Fingerprint inputs | Derive fingerprints from structured canonical fields: normalized file path, location, severity, finding type, and normalized required-fix text. |
| Progress baseline | Compare the current unresolved fingerprints with the most recent prior snapshot for the same feature, phase, and review gate. |
| Integration evidence | Implement pure normalization and classification helpers, call them through an explicit adapter at the recovery gate, and record additive workflow-history evidence. |

## Fingerprint Contract

Finding fingerprints must be deterministic and suitable for comparison across recovery attempts.

Each fingerprint should be derived from these canonical fields:

| Field | Requirement |
| --- | --- |
| File path | Normalize path separators and remove non-semantic path noise so equivalent repository-relative paths match. |
| Location | Normalize available location information such as line, range, symbol, or section. The implementation should be deterministic when exact line numbers shift but the finding remains tied to the same affected location. |
| Severity | Normalize severity labels into the canonical severity values already used by the review or ledger layer. |
| Finding type | Normalize the category/type of issue, such as correctness, test failure, security, maintainability, or policy violation. |
| Required fix text | Normalize required-fix text by removing non-semantic formatting, casing, whitespace, and wording noise while preserving the required remediation meaning. |

Equivalent findings must produce the same fingerprint when only formatting, ordering, casing, whitespace, or non-semantic wording changes. Material differences in affected file, location, severity, finding type, or required fix must produce distinct fingerprints.

## Progress Baseline

The recovery policy must compare the current unresolved finding set against the latest prior snapshot for the same:

- feature;
- phase;
- review gate.

This keeps the policy deterministic and avoids ambiguous comparisons against unrelated history. The policy should not infer progress from unrelated features, phases, gates, or older snapshots when a newer same-gate snapshot exists.

## Progress Classification

Recovery progress must be classified into explicit states:

| State | Meaning | Recovery behavior |
| --- | --- | --- |
| `new` | No prior same-gate unresolved snapshot exists, or this is the first review result for the gate. | Continue if unresolved findings exist and the review is not blocked. |
| `shrinking` | The current unresolved fingerprint set is a strict subset of the prior same-gate unresolved set. | Continue recovery because findings are being resolved. |
| `changed` | The current unresolved set differs from the prior set, with new or materially changed fingerprints. | Continue recovery because the failure surface changed. |
| `same-with-progress` | Fingerprints are the same, but policy-recognized progress evidence indicates meaningful work occurred. | Continue recovery when explicit progress evidence is available. |
| `same-no-progress` | The unresolved fingerprint set is identical to the prior same-gate unresolved set and no progress evidence is present. | Stop recovery. |
| `approved` | The review result is approved and has no unresolved blocking findings. | Complete the review gate; do not trigger recovery. |
| `blocked` | The review result explicitly returns `BLOCKED`. | Stop recovery immediately. |

## Recovery Decision Policy

The recovery decision helper must be pure and deterministic. Given the current review result, current unresolved findings, and the latest prior same-gate snapshot, it must return:

- the progress classification;
- whether recovery should continue or stop;
- the normalized current unresolved fingerprints;
- the prior comparison fingerprint set, when available;
- concise decision evidence suitable for workflow-history storage.

The recovery loop must continue when unresolved findings are demonstrably changing, shrinking, or otherwise have explicit progress evidence. It must stop when identical unresolved fingerprints repeat without progress. It must also stop immediately when the review explicitly returns `BLOCKED`.

Approved review results are complete and must not trigger another recovery attempt.

## Integration With FEAT-042 Finding Ledger

FEAT-043 must integrate with the FEAT-042 finding ledger as an additive backend policy extension.

The implementation should:

1. Keep FEAT-042 as the source of review finding ledger records and snapshots.
2. Add pure normalization and classification helpers for FEAT-043.
3. Add explicit adapter wiring at the code-review recovery gate.
4. Read the latest prior same-feature, same-phase, same-gate snapshot from the ledger or associated workflow history.
5. Apply the fingerprint recovery policy to the current review result.
6. Store additive decision metadata in workflow history.
7. Avoid replacing the ledger or redesigning unrelated workflow state.

## Workflow History Evidence

Workflow history must record enough evidence to audit why recovery continued or stopped.

At minimum, the recorded evidence should include:

- feature ID;
- phase ID or phase name;
- review gate identifier;
- review result status;
- progress classification;
- continue/stop decision;
- normalized current unresolved fingerprints;
- prior same-gate comparison fingerprints, when available;
- counts for current unresolved, prior unresolved, added, removed, and unchanged fingerprints;
- concise reason text for the decision.

The history entry should avoid storing excessive raw review text when normalized fingerprint evidence is sufficient.

## Acceptance Criteria

- Deterministic normalization converts code-review findings into stable fingerprints suitable for comparison across recovery attempts.
- Fingerprints are derived from normalized file path, location, severity, finding type, and normalized required-fix text.
- Equivalent findings produce the same fingerprint even when non-semantic formatting, ordering, casing, whitespace, or wording noise changes.
- Materially different findings produce distinct fingerprints when the affected file, location, finding type, severity, or required fix changes.
- Recovery progress is classified into explicit states including:
  - `new`
  - `shrinking`
  - `changed`
  - `same-with-progress`
  - `same-no-progress`
  - `approved`
  - `blocked`
- The policy compares current unresolved fingerprints against the latest prior snapshot for the same feature, phase, and review gate.
- The recovery loop continues when unresolved findings are demonstrably changing or shrinking.
- The recovery loop can continue for `same-with-progress` only when explicit policy-recognized progress evidence is present.
- The recovery loop stops when identical unresolved fingerprints repeat without progress.
- The recovery loop stops immediately when the review result is explicitly `BLOCKED`.
- Approved review results are classified as complete and do not trigger further recovery.
- Decision helpers are pure and covered by focused unit tests.
- Adapter wiring integrates the fingerprint recovery policy with the existing FEAT-042 finding ledger without replacing the ledger.
- Workflow history records the normalized-fingerprint decision evidence needed to audit why recovery continued or stopped.
- Regression tests cover:
  - stable fingerprint generation;
  - equivalent findings with non-semantic formatting or wording differences;
  - materially different findings;
  - changed versus unchanged unresolved findings;
  - shrinking finding sets;
  - repeated identical unresolved findings;
  - latest same-feature, same-phase, same-gate baseline selection;
  - approved review results;
  - blocked review results.

## Validation

FEAT-043 is confirmed as an additive backend policy extension for EPIC-008 and a follow-up to FEAT-042. It should proceed to refinement with the assumption that FEAT-042 provides the finding ledger foundation, while FEAT-043 defines the deterministic fingerprint recovery policy and its integration points.

The clarified implementation direction is to build pure fingerprint normalization and progress-classification helpers, wire them through an explicit recovery-gate adapter, compare against the latest prior same-feature, same-phase, same-gate snapshot, and persist additive workflow-history evidence for auditability.
