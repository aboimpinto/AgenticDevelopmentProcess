# System Architecture

## Overview

For the authoritative command, transition, recovery, cancellation, and
completion diagrams—with direct links from every transition ID to its owning
production method and tests—see
[Hepha Workflow Control-Flow Map](workflow-control-flow-map.md). Architecture
diagrams in this document explain system boundaries; they do not independently
define workflow transitions.

The platform has three main layers:

```text
Dashboard UI
  Kanban boards, questions, reviews, screenshots, run logs
        |
        | HTTP commands
        | Server-Sent Events or WebSocket events
        v
Orchestrator Service
  state machine, automation rules, queue, safety gates, model routing
        |
        | local process/session control
        v
Pi Specialist Agents
  requirements, design, refinement, implementation, tests, review, docs, git
```

## Runtime Components

| Component | Responsibility |
| --- | --- |
| Dashboard | User control surface for boards, questions, reviews, verification, and logs. |
| API Server | Receives dashboard actions and exposes project, board, run, question, and feedback APIs. |
| Orchestrator Worker | Watches state changes, creates jobs, spawns agents, and advances cards. |
| Queue | Stores pending, running, blocked, failed, and completed jobs. |
| SQLite State Store | Stores board state, run state, questions, approvals, feedback, queue items, and agent events in a local workspace database file. |
| Observability Event Ingest | Normalizes Pi worker events, persists traces, and broadcasts live updates. |
| MemoryBank Adapter | Reads and writes durable project artifacts in the existing MemoryBank structure. |
| Agent Runtime Adapter | Starts Pi agent sessions and streams events back to the orchestrator. |
| Model Router | Selects OpenAI/Codex or DeepSeek model based on task and project. |
| Git Manager | Coordinates branches, commits, worktrees, repository cleanliness, and push readiness. |

## Pi Worker Adapter

The first implementation should use a Pi worker adapter that can spawn isolated Pi worker processes in JSON event stream mode.

Initial worker shape:

```text
pi --mode json -p --no-extensions --model <model> --tools <tools> --append-system-prompt <agent-prompt> --session <session-file> <task>
```

The adapter should parse JSONL events and persist them to the run/event log. This follows the strongest reusable pattern found in the `disler/pi-vs-claude-code` examples while keeping our dashboard and orchestrator as the product surface.

The SDK remains a good later option, but JSON mode gives v1 better process isolation and an easier failure boundary.

## Observability Event Ingest

Agent observability should be a first-class platform feature. Every worker run should produce a normalized event trace that can be queried from the dashboard and linked from the related project, card, job, run, question, feedback item, or Git session.

The canonical event envelope should include:

- `event_id`
- `ts`
- `type`
- `session_id`
- `session_file`
- `cwd`
- `agent_name`
- `pool`
- `tags`
- `provider`
- `model`
- `payload`
- `seq`

Minimum Pi event types:

- `session_start`
- `agent_start`
- `turn_start`
- `user_message`
- `assistant_message`
- `tool_call`
- `tool_result`
- `model_change`
- `thinking`
- `error`
- `turn_end`
- `agent_end`
- `session_shutdown`
- `compaction`
- `branch_nav`

The worker can initially translate `pi --mode json` output into this envelope. Later, a Pi observability extension can emit the same schema directly.

Events should carry tags such as `project:<id>`, `card:<id>`, `job:<id>`, `run:<id>`, `agent:<type>`, and `model:<model>`. This keeps filtering simple and lets the dashboard provide single-run, card-level, and multi-agent views from the same event store.

Observability must not block agent execution. If event delivery fails, the worker should retry with backoff and continue the agent run where possible.

## Recommended Stack

Start with one Node.js/TypeScript application containing both API and worker.

Recommended first stack:

- Node.js + TypeScript.
- Fastify or Express for API.
- React or Next.js for dashboard.
- SQLite for local orchestration state.
- A small repository-owned data access layer for SQLite persistence.
- Server-Sent Events for live run updates in v1.
- File-based MemoryBank artifacts for durable human-readable project state.

The backend and worker can start in one process. Split them later only if needed.

## Process Model

```text
User moves card
    |
    v
Dashboard sends state transition request
    |
    v
API validates transition and writes state
    |
    v
Orchestrator detects trigger column
    |
    v
Job created in queue
    |
    v
Worker selects agent and model
    |
    v
Pi agent runs
    |
    v
Events, questions, files, commits, and status are persisted
    |
    v
Card moves to next state, waiting state, failed state, or verification
```

## State Ownership

The orchestrator owns workflow state.

The dashboard does not decide what agent to run. It requests state transitions and displays outcomes.

Agents do not directly decide final board movement. They return structured results. The orchestrator validates those results, applies transition rules, and advances the board.

Agents do not own their own databases. Pi worker processes stream JSON events and final results back to the orchestrator. The orchestrator is the only writer for workflow state, jobs, questions, approvals, feedback, and run events.

## Agent Execution Contract

Each agent run should receive:

- Project path.
- EPIC or FEAT ID.
- Current board state.
- Relevant MemoryBank files.
- Command definition.
- Allowed tools/actions.
- Model choice.
- Safety policy.
- Expected output schema.

Each agent run should return:

- Status: `completed`, `blocked`, `needs_user_answer`, `failed`, or `needs_manual_review`.
- Files created or changed.
- Questions created.
- Feedback requests.
- Git actions performed or requested.
- Next recommended state.
- Run summary.

## Always-Running Mode

The orchestrator should run as a local service:

```powershell
pnpm dev
```

Later:

```powershell
agentic-dev start
agentic-dev stop
agentic-dev status
```

The service listens for dashboard state changes, queued jobs, user answers, verification feedback, and optionally file changes.

## Safety Model

The system should automate aggressively inside approved workflow boundaries, but gate operations with broader impact.

Approval-gated actions:

- `git push`
- Pull request creation.
- Release/deploy commands.
- Deleting files outside the feature/worktree scope.
- Changing configured project settings.
- Running expensive or long jobs beyond configured limits.

Implementation can be autonomous after the user moves a FEAT into the implementation trigger column.
