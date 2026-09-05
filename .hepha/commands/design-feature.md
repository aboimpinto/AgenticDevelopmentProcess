---
name: design-feature
version: 0.1.0
agent: design-agent
agent_action: design-feature
inputs:
  - project
  - feature
  - linked_epics
  - ui_guidance
  - active_lessons
outputs:
  - ux_research
  - wireframes
  - design_summary
required_gates:
  - user_workflow_clear
  - screens_or_states_named
  - accessibility_risks_named
---

# Design Feature

## Objective

Create design artifacts for a FEAT that requires UI, UX, screen-flow, or
interaction decisions before refinement.

## Required Behavior

- Read the FEAT, linked EPIC context, project UI guidance, and active
  LessonsLearned rules supplied by Hepha.
- Identify user roles, primary workflows, alternate states, errors, and empty
  states.
- Define wireframes or screen/state sketches in text form unless Hepha provides
  a visual rendering task.
- Name component boundaries when they affect implementation.
- Identify acceptance criteria that refinement must convert into phase tasks.
- Do not implement source code.
- Do not move the FEAT to Ready To Implement.

## Output Contract

Produce durable design artifacts suitable for `refine-feature` input.

## Stop Conditions

Stop and report a blocker if the FEAT requires product decisions that cannot be
reasonably inferred from the EPIC, FEAT, and Deep-Dive answers.
