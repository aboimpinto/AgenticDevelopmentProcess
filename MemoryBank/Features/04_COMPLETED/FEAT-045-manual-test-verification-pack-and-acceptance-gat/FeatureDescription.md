# FEAT-045: Manual Test Verification Pack And Acceptance Gate

**Feature ID**: FEAT-045  
**Parent Epic**: EPIC-008  
**Status**: Completed

## Summary

Generate a durable Manual Test Verification Pack in canonical Markdown and PDF formats. The pack lists happy-path manual tests derived from acceptance criteria, Gherkin scenarios, and applicable EPIC-level tests; records normalized source hashes for traceability and staleness detection; provides open and download actions; requires explicit review of a current pack before Manual Tests can be recorded; and creates durable Human Review Findings for failed tests.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- Generate a deterministic Manual Test Verification Pack from the feature's acceptance criteria, Gherkin scenarios, and applicable EPIC-level tests.
- Generate one canonical Markdown source for each pack and derive its PDF using the project's approved headless renderer.
- Produce durable Markdown and PDF versions of the generated pack.
- Include happy-path manual test cases with clear steps and expected outcomes.
- Persist pack metadata, including the normalized traced source inputs and their content hashes used for generation.
- Detect and expose when a stored pack is stale because its traced source content has changed.
- Provide actions to open and download the generated Markdown and PDF pack artifacts.
- Require an explicit review of the current, non-stale pack before Manual Tests may be recorded.
- Invalidate the effective review when traced source changes make its pack stale.
- Block new Manual Test records until a newly generated current pack is explicitly reviewed, while retaining prior packs and reviews for audit.
- Record the pack review outcome and retain its relationship to the reviewed pack.
- Persist separate additive records for verification packs, pack reviews, manual test results, and Human Review Findings.
- Require every failed manual test to create a structured, persisted Human Review Finding.
- Link each Human Review Finding to the verification pack, relevant source criterion, failed test result, and pack review outcome.
- Keep pack-currentness, staleness, and manual-test gate decisions in pure policy helpers, with persistence integrated by the host workflow.
- Preserve generated packs, test records, reviews, and findings as auditable workflow artifacts.

## Deterministic Generation Contract

- The traced inputs are the feature acceptance criteria, Gherkin scenarios, and applicable EPIC-level tests.
- Generation normalizes traced inputs before hashing them.
- The normalized inputs, source hashes, generation metadata, and rendered canonical Markdown form the traceable pack record.
- PDF is derived from the canonical Markdown through the project's approved headless renderer rather than independently authored.
- A pack is current only while its stored source hashes match hashes computed from the current normalized traced inputs.

## Manual-Test Gate Lifecycle

1. Generate a pack from the current traced inputs.
2. Review the current pack explicitly and persist the review outcome.
3. Permit recording Manual Test results only when the reviewed pack remains current.
4. When traced inputs change, mark affected packs stale and invalidate their effective review for new test recording.
5. Require regeneration and explicit review of a newly current pack before recording further Manual Test results.
6. Retain stale packs, prior reviews, and existing test records as immutable audit history.

## Durable Record Relationships

| Record | Purpose | Required relationships |
| --- | --- | --- |
| Verification Pack | Stores canonical Markdown, derived PDF, normalized traced inputs, hashes, and generation metadata. | Feature and traced source criteria/tests |
| Pack Review | Records an explicit decision on a specific generated pack. | Verification Pack |
| Manual Test Result | Records the result of a manual test performed under an eligible reviewed pack. | Verification Pack and Pack Review |
| Human Review Finding | Captures a failed manual-test outcome as a durable structured finding. | Verification Pack, relevant source criterion, failed Manual Test Result, and Pack Review |

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Pack generation contract | Generate one deterministic canonical Markdown source, derive the PDF with the project's approved headless renderer, and hash normalized traced inputs. |
| Manual-test gate lifecycle | Invalidate the effective review when source changes make a pack stale. Block new Manual Test records until a newly generated current pack is explicitly reviewed; retain prior artifacts for audit. |
| Findings and persistence boundary | Use separate, additive persisted pack, review, test-result, and finding records. Keep gate and staleness decisions in pure helpers and wire persistence into the host workflow. |
| Acceptance gate | Implement a required reviewed pack with traceability. Generate Markdown and PDF from acceptance criteria, Gherkin scenarios, and EPIC tests; record source hashes; and require explicit review before Manual Tests can be recorded. |
| Failed manual tests | Create durable Human Review Findings. Each failed test must create a structured, persisted finding linked to the pack, source criteria, and review outcome. |

## Validation

- The FEAT scope is confirmed for refinement, design decisions, and implementation planning.
