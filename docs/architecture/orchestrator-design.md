# Orchestrator Design

## Goal

Build an agentic development platform that replaces the existing DevCycle MCP workflow with an orchestrated multi-agent execution system.

## Core Principle

The new platform owns the process directly. The old DevCycle MCP repository provides migration source material only.

The orchestrator owns board state, command routing, model choice, job queueing, safety gates, and agent coordination. Pi agents own the actual workflow execution.

Kanban movement is the primary trigger. Manual command buttons are secondary controls for retry, pause, cancel, override, and diagnostics.

## Main Components

| Component | Responsibility |
| --- | --- |
| Workflow command router | Maps lifecycle commands to native agent tasks and state transitions. |
| Procedure executor | Executes native command procedures produced from migrated DevCycle templates. |
| Board state machine | Validates EPIC and FEAT column transitions and trigger rules. |
| Job queue | Stores triggered work and protects against duplicate runs. |
| Model router | Chooses OpenAI/Codex or DeepSeek based on task risk and cost. |
| Agent registry | Maps workflow steps to specialist Pi agents. |
| Run state store | Tracks feature ID, phase, agent, model, actions, results, and blockers. |
| Safety gate | Requires explicit approval for destructive, external, or expensive actions. |
| Git manager | Coordinates branches, commits, worktrees, and push readiness. |

## Initial Agents

| Agent | Primary Work |
| --- | --- |
| Requirements Agent | Epic and feature capture, deep-dive preparation, ambiguity detection. |
| Design Agent | UX research, wireframes, design summaries. |
| Refinement Agent | Phased task planning, Gherkin specs, quality gate planning. |
| Implementation Agent | Code changes and local verification. |
| Test Agent | Test design, regression checks, failure analysis. |
| Code Review Agent | Independent review against project guidelines. |
| Documentation Agent | Lessons learned, completion reports, project memory updates. |
| Git Agent | Branch, commit, worktree, repository hygiene, push/PR preparation. |
| Node/TypeScript Developer Agent | Node.js, TypeScript, React, Next.js, and related projects. |
| C# Developer Agent | .NET, C#, solution/project structure, and related tests. |
| Rust Developer Agent | Rust crates, Cargo workspaces, ownership-aware changes, and tests. |

## Model Routing Draft

| Work Type | Default Model |
| --- | --- |
| Fast summaries and status checks | `deepseek-v4-flash` |
| Planning and architecture | `gpt-5.5` |
| EPIC and FEAT deep-dive | `gpt-5.5` |
| FEAT refinement and phase planning | `gpt-5.5` |
| Code review and risk analysis | `gpt-5.5` |
| Refined autonomous implementation | `deepseek-v4-flash` |
| Complex refactoring fallback | `gpt-5-codex` |
| Routine documentation and summaries | `deepseek-v4-flash` |

The intended cost strategy is asymmetric. Use high-thinking models while the
work is ambiguous and during review gates. Use `deepseek-v4-flash` for
implementation only after refinement has produced concrete phase tasks,
interfaces, tests, and acceptance criteria.

## First Vertical Slice

1. Create a local dashboard with EPIC and FEAT boards.
2. Support creating an EPIC or FEAT card.
3. Move a FEAT from `Submitted` to `Clarify`.
4. Let the orchestrator validate the transition and queue `deep-dive-feature`.
5. Route the job to the Requirements Agent.
6. Persist questions, answers, run events, and resulting MemoryBank files.
7. Move the card to `Spec Review` when clarification is complete.

## Safety Notes

- Never store API keys in run logs.
- Treat git push, remote writes, deletes, and broad filesystem changes as approval-gated actions.
- Keep command result handling deterministic before adding autonomous loops.
