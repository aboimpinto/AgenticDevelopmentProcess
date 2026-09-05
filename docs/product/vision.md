# HEPHA Product Vision

## Purpose

HEPHA is a local-first platform for running a software development lifecycle
with substantial automation inside boundaries deliberately set by a human.
The objective is dependable delivery with visible state and evidence, not
autonomy for its own sake.

The concise public mission is defined in [`../../MISSION.md`](../../MISSION.md),
and the current and planned control model is defined in
[`../../SUPERVISION.md`](../../SUPERVISION.md).

The platform replaces the old DevCycle MCP runtime with native Pi-based agents coordinated by an always-running orchestrator. The user works from a local dashboard that looks and behaves like a product/work board, not a chat-only tool.

## Product Shape

The first product is a local dashboard and orchestrator for managing EPICs and FEATs.

The dashboard provides:

- EPIC Kanban board.
- FEAT Kanban board.
- Live agent run status.
- Question-by-question clarification flow.
- Document review and approval views.
- Manual verification workspace.
- Screenshot and feedback capture.
- Git, branch, commit, and worktree visibility.

The orchestrator provides:

- Workflow state machine.
- Automation rules.
- Agent spawning and routing.
- Model routing.
- Queue management.
- User question handling.
- Safety gates.
- Run logs.
- Git/worktree coordination.

The process deliberately drills work down through increasingly concrete levels:

```text
EPIC -> FEAT -> Phase -> Task
```

EPICs capture strategic intent, FEATs define deliverable capability, phases
sequence implementation and verification, and tasks become the executable unit
for coding agents. Each transition should add detail and reduce ambiguity.

## Automation Position

The platform should aim for high automation within an explicitly authorized
workflow scope.

Manual buttons are allowed as overrides, but the normal interaction model is state-driven:

- Moving an EPIC card to a trigger column starts the appropriate EPIC agent.
- Moving a FEAT card to a trigger column starts the appropriate FEAT agent.
- When an agent needs clarification, the card enters a waiting state and the dashboard prompts the user one question at a time.
- When an agent finishes, the orchestrator moves the card to the next review or action column.
- Implementation should run autonomously after the user intentionally moves a FEAT into the implementation trigger state.

The user should not have to manually click every lifecycle command. The board state should drive the workflow.

## Human Control Points

The system should automate routine work while preserving human judgment at important points.

Required human control points:

- EPIC creation intent and scope confirmation.
- Deep-dive answers and clarification.
- Review of generated EPIC and FEAT documents.
- Decision to send a FEAT into implementation.
- Manual verification of implemented behavior.
- Approval of fixes after feedback loops.
- Permission for pushes, PR creation, release actions, and broad destructive operations.

## First Class Concepts

| Concept | Meaning |
| --- | --- |
| EPIC | A strategic initiative that can generate multiple FEATs. |
| FEAT | A concrete feature that can move from clarification to implementation and verification. |
| Board Column | A workflow state. Some columns trigger agent work. |
| Agent Run | One execution attempt by a specialist agent. |
| Question | A user-facing clarification item produced by an agent. |
| Verification Session | A user review loop with screenshots, notes, and fix requests. |
| Git Session | Branch, commit, worktree, and repository hygiene activity tied to a FEAT. |

## Success Criteria

- A user can create an EPIC in the dashboard and move it through clarification into FEAT extraction.
- A user can create or receive FEATs and move them through clarification, design, refinement, implementation, verification, and done.
- The orchestrator can run without constant manual command clicks.
- Agent runs are auditable and resumable.
- User questions are shown one at a time and answers are attached to the correct EPIC/FEAT.
- Implementation work happens on the correct branch or worktree.
- Manual feedback with screenshots can trigger correction loops.
- The system remains local-first and does not store secrets in project files or logs.

## Non-Goals For The First Version

- Cloud-hosted multi-user platform.
- Full replacement for GitHub issues or project boards.
- Fully unattended production deployment.
- Arbitrary background code changes without explicit workflow state movement.
- Complex organizational permission model.
