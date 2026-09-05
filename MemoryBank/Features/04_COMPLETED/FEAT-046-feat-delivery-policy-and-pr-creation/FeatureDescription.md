# FEAT-046: FEAT Delivery Policy And PR Creation

**Feature ID**: FEAT-046  
**Parent Epic**: EPIC-008  
**Status**: Completed

## Summary

Add a durable Hepha Delivery section to FEAT documents supporting `direct_merge` and `pull_request` modes. Automatically create or update a PR after User Code-Review and accepted Manual Test Verification when PR mode is selected. Link PRs to GitHub issues. Keep PR-delivery FEATs in progress until PR gates pass.

## Source

- EPIC: EPIC-008 - Autonomous Implementation Review And Completion
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Acceptance Criteria

- FEAT documents persist an explicit Delivery choice of `direct_merge` or `pull_request`.
- Delivery-policy decisions are implemented through pure policy helpers with wired adapters for workflow and GitHub operations.
- In `pull_request` mode, Hepha creates or updates the feature PR only after User Code-Review and Manual Test Verification have both been accepted.
- PR creation or updates link the PR to the relevant GitHub issue when an issue is associated with the FEAT.
- A FEAT in `pull_request` mode remains in progress until its required PR delivery gates pass.
- `direct_merge` mode follows its delivery policy without requiring PR creation.
- The feature does not automate PR merging.
- The feature does not poll CI status or implement CI-based completion handling.

## Validation

The generated scope is confirmed for refinement with explicit boundaries: durable delivery-mode policy, gated PR creation or updates, GitHub issue linking, and an in-progress lifecycle for PR-mode FEATs.

## Hepha Deep-Dive Decisions

| Topic | Decision |
| --- | --- |
| Acceptance boundary | Core PR delivery policy |
| Delivery modes | Persist `direct_merge` and `pull_request` choices |
| PR timing | Create or update PRs only after accepted User Code-Review and Manual Test Verification |
| Integration approach | Use pure policy helpers with wired adapters |
| Issue linkage | Link delivery PRs to associated GitHub issues |
| PR lifecycle | Keep PR-mode FEATs active until PR gates pass |
| Exclusions | Automated merging and CI polling |
