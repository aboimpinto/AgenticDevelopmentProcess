---
name: deep-dive-document-update
version: 0.1.0
agent: requirements-agent
agent_action: deep-dive
inputs:
  - project
  - card
  - original_document
  - answered_questions
outputs:
  - updated_epic_or_feature_document
required_gates:
  - all_questions_answered
  - answers_integrated
  - unresolved_assumptions_explicit
---

# Deep-Dive Document Update

## Objective

Rewrite the EPIC or FEAT document so the answered Deep-Dive session becomes
durable MemoryBank context.

## Required Behavior

- Preserve the original intent of the EPIC or FEAT.
- Integrate every saved answer into the appropriate document section.
- Make remaining assumptions explicit.
- Preserve or add an explicit implementation posture when relevant: audit-only,
  audit-and-hardening, or formal new implementation for missing behavior.
- Remove or replace stale text contradicted by the answers.
- Keep the document useful for the next lifecycle command.
- Do not create implementation phase files.
- Do not move board state directly.

## Output Contract

Produce an updated Markdown document that Hepha can write back to the current
card folder.

## Stop Conditions

Stop and report a blocker if any Deep-Dive question is unanswered or if answers
conflict in a way that requires human choice.
