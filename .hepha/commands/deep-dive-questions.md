---
name: deep-dive-questions
version: 0.1.0
agent: requirements-agent
agent_action: deep-dive
inputs:
  - project
  - card
  - current_document
  - validation_topics
outputs:
  - clarification_questions
required_gates:
  - questions_are_actionable
  - questions_are_not_duplicates
  - no_implementation_without_answers
---

# Deep-Dive Questions

## Objective

Inspect the EPIC or FEAT document and produce the smallest useful set of
clarification questions needed before the next lifecycle step.

## Required Behavior

- Read the current card document and linked context supplied by Hepha.
- Focus on ambiguity that blocks downstream work.
- Check the implementation posture for the item: audit-only, audit-and-hardening,
  or formal new implementation. If the document does not clearly say whether
  missing behavior must actually be built, ask a direct question before the next
  lifecycle step.
- Ask concrete questions that the user can answer without reverse-engineering
  the implementation.
- Prefer one direct question over several vague alternatives.
- Do not ask about details already answered in the document.
- Do not start design, refinement, or implementation.

## Output Contract

Return structured clarification questions with:

- stable question id;
- short prompt;
- why the answer matters;
- expected answer shape when useful;
- lifecycle topic or risk area;
- implementation posture topic when the question is about audit versus new
  implementation scope.

## Stop Conditions

Stop and report a blocker if the source card document is missing, unreadable, or
not specific enough to determine whether the item is an EPIC or FEAT.
