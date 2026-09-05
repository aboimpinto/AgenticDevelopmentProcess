---
name: start-feature-postprocess
version: 0.1.0
agent: implementation-lead
agent_action: start-feature
inputs:
  - project
  - feature
  - phase_documents
  - active_lessons
  - historical_estimation_calibration
outputs:
  - phase_routing
  - effort_estimates
  - resume_ledger
required_gates:
  - phase_sequence_clear
  - implementation_entrypoint_selected
  - resume_state_recorded
---

# Start Feature Postprocess

## Objective

Prepare the refined FEAT for autonomous implementation after the branch and
In Progress state are ready.

## Required Behavior

- Read `FeatureTasks.md` and phase documents supplied by Hepha.
- Add or refresh phase routing recommendations.
- Calculate and add implementation entry points plus Human and AI effort estimates for every numbered phase.
- Calibrate scope-based estimates against comparable completed FEAT prediction/actual evidence supplied by Hepha.
- Treat historical ratios as evidence, explain justified divergence, and never copy a prior duration blindly.
- Create or refresh resume ledger information.
- For every V3 phase, treat `PhaseExecutionContract.json` as the only machine task authority. Its `## Phase Task Ledger` must contain exactly one checkbox per declared contract task, in contract order, with matching `[contract:<id>]` and `[executor:<executor>]` markers. Do not add descriptive or uncontracted checkboxes to the ledger; place descriptive work under `## Detailed Work` as plain bullets.
- Preserve approved planning intent.
- Preserve each phase's V3 `gitCheckpoint: commit_and_push` contract and pending
  `## Git Checkpoint` audit section. Branch selection, commits, audit hashes,
  and pushes are HEPHA-owned workflow operations, not agent-authored estimates.
- Add a FeatureTasks.md timing summary that totals all phase estimates.
- Use parseable compact estimates only: `30m`, `1h`, or a same-unit range such as `2-3h`. In ranges, use the literal ASCII hyphen-minus (`-`, U+002D) only; never use an en dash (`–`, U+2013), em dash (`—`, U+2014), or another typographic dash.
- Before returning, inspect every phase estimate and the `## Implementation Timing Summary`; replace any typographic range dash with the ASCII hyphen-minus.
- Do not record or invent actual execution time; Hepha records it from completed worker timestamps.
- Do not broaden scope.
- Do not mark any phase complete.

## Output Contract

Return updated implementation handoff details that the implementation loop can
use to select the next phase task. Do not report completion until every range
uses the ASCII hyphen-minus required above.

## Stop Conditions

Stop and report a blocker if phase documents are missing, contradictory, or too
weak to start implementation safely.
