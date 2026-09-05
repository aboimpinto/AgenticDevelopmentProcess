# FEAT-048: Review And Repair Skills Pilot

**Feature ID**: FEAT-048  
**Parent Epic**: EPIC-009  
**Status**: Ready for Refinement

## Summary

Create `review-phase` and `repair-review-findings` skills that apply active LessonsLearned constraints. Compare skill-backed and command-template paths using equivalent representative fixtures, then record audited evidence before adopting the skills.

## Source

- EPIC: EPIC-009 - Pi Skills And Extensions Integration
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Pilot Scope

Use representative review scenarios that cover both normal and recovery paths:

1. Clean review: no required finding and a successful gate outcome.
2. Required finding: a review result that requires repair.
3. Repair success: a required finding followed by successful repair and recovery.
4. Repeated failure: unresolved findings through the defined recovery path.

Each fixture must be executed through both the skill-backed and command-template paths using equivalent inputs and active LessonsLearned constraints.

## Acceptance Criteria

- Create `review-phase` and `repair-review-findings` skills that apply active LessonsLearned constraints.
- Exercise skill-backed and command-template paths against the clean, required-finding, repair-success, and repeated-failure fixtures.
- Produce a normalized evidence bundle for each path and fixture containing fixture identifiers, gate decisions, comparable receipt fields, normalized findings, and recovery decisions.
- Compare gate outcomes, receipts, findings, and recovery behavior between both paths.
- Record an audited comparison that identifies equivalent behavior, intentional receipt or wording differences, and any unexplained differences.
- Adopt the skills only when every required fixture has equivalent gate outcomes and recovery decisions, with intentional receipt or wording differences documented.

## Validation

The pilot comparison is valid only when both paths produce normalized evidence for every required fixture. Unexplained behavioral differences block adoption until resolved or explicitly addressed through a follow-up decision.

## Hepha Deep-Dive Decisions

- The pilot comparison set will use clean, required-finding, repair-success, and repeated-failure fixtures covering normal and recovery paths.
- Both paths must produce a normalized evidence bundle with comparable gate decisions, receipt fields, normalized findings, recovery decisions, and fixture identifiers.
- Skills may be adopted only when all required fixtures have equivalent gate outcomes and recovery decisions; intentional receipt or wording differences must be documented.
