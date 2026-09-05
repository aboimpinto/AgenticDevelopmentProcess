---
name: complete-feature
version: 0.1.0
agent: documentation-agent
agent_action: complete-feature
inputs:
  - project
  - feature
  - implementation_evidence
  - review_evidence
  - manual_acceptance
  - active_lessons
outputs:
  - completion_report
  - raw_lessons_learned
  - estimation_retrospective
  - completed_feature_state
required_gates:
  - all_phases_complete
  - review_evidence_present
  - manual_acceptance_recorded
  - lessons_learned_recorded
---

# Complete Feature

## Objective

Finalize a FEAT after implementation, review, and manual acceptance evidence
are present.

## Required Behavior

- Read final FEAT state, phase state, review reports, verification evidence,
  and user acceptance notes supplied by Hepha.
- Confirm every phase is complete.
- Confirm required review and manual acceptance evidence exists.
- Produce completion documentation and raw LessonsLearned.
- Add an estimation retrospective led by estimated competent-human delivery versus measured AI execution and the resulting gain/acceleration.
- Keep AI-estimate error as internal calibration evidence, not as the delivery-performance comparison.
- Record a concrete calibration recommendation for future Start Feature predictions.
- Do not invent test results.
- Do not move the FEAT to Completed unless evidence gates pass.

## Output Contract

Return completion documentation updates and a raw LessonsLearned summary that a
separate curator can later promote into active rules.

## Stop Conditions

Stop and report a blocker if evidence is missing, phase status is inconsistent,
or review/manual acceptance is incomplete.
