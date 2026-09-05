# Dashboard And Orchestrator V1 Plan

## Purpose

Start the platform with a working dashboard and orchestrator skeleton that proves the core operating model:

1. A user moves a FEAT card on the dashboard.
2. The orchestrator validates the transition.
3. The orchestrator queues a job.
4. A worker emits live events.
5. The dashboard shows what is happening now.
6. The user answers a generated question.

This first slice should prove automation, live observability, and user clarification before real implementation agents are connected.

## Main Decision

Use a TypeScript `pnpm` monorepo.

The orchestrator should be logically standalone from the dashboard, but both can run together in local development through one `pnpm dev` command.

The dashboard is UI only. It should never run agents directly, write SQLite directly, or infer workflow transitions by itself.

The orchestrator owns:

- SQLite writes.
- Board transition validation.
- Job queueing.
- Worker loop.
- Agent process spawning.
- Event ingest.
- Server-Sent Events stream.
- Model routing.
- Approval and safety gates.

## Repository Shape

Recommended v1 layout:

```text
AgenticDevelopmentProcess/
  apps/
    web/              React/Vite dashboard
    orchestrator/     Fastify API + SSE + worker loop
  packages/
    shared/           shared types: cards, states, jobs, events, questions
    db/               SQLite schema and query helpers
    agent-runtime/    Pi process adapter and event parser
```

The first implementation can keep the orchestrator API and worker loop in one process. Later, if concurrency or deployment needs justify it, split it into:

```text
apps/
  orchestrator-api/
  orchestrator-worker/
```

Do not start with that split. The early risk is workflow correctness, not process topology.

## Local Development

`pnpm dev` should start both main processes:

```text
apps/web           dashboard UI
apps/orchestrator  API, queue worker, event stream
```

The dashboard talks to the orchestrator over local HTTP and subscribes to live activity over Server-Sent Events.

SQLite is the local runtime store. Agents do not own databases and the dashboard does not read agent-local state.

## First Vertical Slice

Build this first:

1. Create a FEAT card in the dashboard.
2. Move the FEAT from `Submitted` to `Clarify`.
3. The orchestrator records the transition.
4. The orchestrator queues a `deep-dive-feature` job.
5. A v1 worker emits fake but realistic events.
6. The dashboard shows the live event timeline.
7. The worker creates one clarification question.
8. The dashboard shows one primary open question.
9. The user submits an answer.
10. The orchestrator records the answer and resumes the job.
11. The worker emits completion events.
12. The orchestrator moves the FEAT to `Spec Review`.

The fake worker is intentional. It validates the board, queue, events, questions, and UI loop before Pi agent execution adds more variables.

## Initial Milestones

### Milestone 1: Workspace Bootstrap

Create the pnpm workspace and minimal apps/packages:

- Root `package.json`.
- `pnpm-workspace.yaml`.
- Shared TypeScript configuration.
- `apps/web`.
- `apps/orchestrator`.
- `packages/shared`.
- `packages/db`.
- `packages/agent-runtime`.

The workspace should run with:

```powershell
pnpm install
pnpm dev
```

### Milestone 2: Shared Domain Types

Define shared types before building UI screens or database access:

- `Project`.
- `Card`.
- `CardKind`.
- `EpicState`.
- `FeatureState`.
- `Transition`.
- `Job`.
- `Run`.
- `AgentSession`.
- `AgentEvent`.
- `Question`.

These types become the contract between dashboard, orchestrator, and tests.

### Milestone 3: SQLite Schema

Add SQL migrations for the v1 entities:

- `projects`.
- `cards`.
- `card_transitions`.
- `jobs`.
- `runs`.
- `questions`.
- `agent_sessions`.
- `agent_events`.
- `run_metrics`.

Use SQLite as the source of truth from the beginning. Do not use local JSON files for runtime state except for temporary fixtures in tests.

### Milestone 4: Orchestrator API

Implement the endpoints needed for the vertical slice:

```http
GET /api/projects
POST /api/projects
GET /api/projects/:projectId/boards/features
POST /api/projects/:projectId/features
GET /api/cards/:cardId
POST /api/cards/:cardId/move
GET /api/cards/:cardId/questions/open
POST /api/questions/:questionId/answer
GET /api/cards/:cardId/runs
GET /api/events/stream
```

`POST /api/cards/:cardId/move` is the automation trigger. It should validate the state change and queue the job inside one database transaction.

### Milestone 5: Fake Worker And Event Stream

Add a simple worker loop that claims queued jobs and emits deterministic events:

- `job.claimed`.
- `agent.started`.
- `agent.message`.
- `tool.started`.
- `tool.finished`.
- `question.created`.
- `agent.waiting_for_user`.
- `question.answered`.
- `agent.resumed`.
- `agent.completed`.
- `card.moved`.

The worker should persist events to SQLite and publish them to the SSE stream.

### Milestone 6: Dashboard FEAT Board

Build only the necessary UI:

- Project selector.
- FEAT board.
- Create FEAT form.
- Drag or action-based move to `Clarify`.
- Card detail panel.
- Live event timeline.
- Open question panel.
- Answer submission.
- Latest run summary.

EPIC board, Git worktrees, screenshot verification, real agent spawning, and rich trace comparison should wait until the clarification loop works.

### Milestone 7: Pi Agent Adapter

Replace the fake worker path with the first Pi-backed Requirements Agent path.

The adapter should:

- Start a Pi agent process.
- Attach project/card/job context.
- Read structured event output.
- Normalize events into the orchestrator event envelope.
- Redact secrets before persistence.
- Convert agent questions into `questions` rows.
- Return a structured completion result.

Keep the fake worker available as a dev/test mode.

## Event Contract

All events should use a stable envelope:

```json
{
  "eventId": "evt_123",
  "agentSessionId": "session_123",
  "seq": 42,
  "ts": "2026-06-09T18:26:23.000Z",
  "type": "question.created",
  "cardId": "FEAT-001",
  "jobId": "job_123",
  "runId": "run_123",
  "payload": {}
}
```

`seq` must be monotonic per agent session. This supports reconnect, replay, trace views, and side-by-side model comparisons.

## Boundaries For V1

In scope:

- Local dashboard.
- Local orchestrator.
- SQLite-backed state.
- FEAT clarification loop.
- Live event timeline.
- One question at a time.
- Fake worker first.
- First Pi-backed Requirements Agent after the fake worker is stable.

Out of scope for the first slice:

- Production deployment.
- Multi-user authentication.
- Remote push or PR creation.
- Full implementation automation.
- Git worktree automation.
- Screenshot verification workspace.
- EPIC extraction automation.
- Race view and card swimlane trace comparison.

## Design Rule

The first version should make the workflow visible before it makes the workflow powerful.

If the dashboard can show a FEAT moving through `Clarify`, a job being queued, events streaming live, a question being answered, and the card reaching `Spec Review`, the platform has proven the hardest architectural path.
