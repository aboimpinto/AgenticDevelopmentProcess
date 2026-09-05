# Dashboard Orchestrator API

## Purpose

The dashboard communicates with the orchestrator through local HTTP APIs and live event streams.

The dashboard requests state changes and submits user input. The orchestrator decides which jobs to queue and which agents to run.

## Communication Pattern

```text
Dashboard
  -> HTTP request for commands and state transitions
  <- JSON response
  <- Server-Sent Events for live updates
```

Server-Sent Events are enough for v1 because most updates are one-way from orchestrator to dashboard. WebSockets can be added later if needed.

## Core Endpoints

### Projects

```http
GET /api/projects
POST /api/projects
GET /api/projects/:projectId
```

### Boards

```http
GET /api/projects/:projectId/boards/epics
GET /api/projects/:projectId/boards/features
```

### Cards

```http
POST /api/projects/:projectId/epics
POST /api/projects/:projectId/features
GET /api/cards/:cardId
PATCH /api/cards/:cardId
POST /api/cards/:cardId/move
```

`POST /api/cards/:cardId/move` is the important automation endpoint. It records the transition and lets the orchestrator decide whether a job should start.

Request:

```json
{
  "toState": "Clarify",
  "reason": "User moved card on board"
}
```

Response:

```json
{
  "cardId": "FEAT-001",
  "fromState": "Submitted",
  "toState": "Clarify",
  "jobQueued": true,
  "jobId": "job_123"
}
```

### Questions

```http
GET /api/cards/:cardId/questions/open
POST /api/questions/:questionId/answer
```

The dashboard should show one primary open question at a time for the selected card.

Answer request:

```json
{
  "answer": "The first version should support email/password login only."
}
```

After an answer is submitted, the orchestrator resumes the paused job or queues the next clarification step.

### Runs And Events

```http
GET /api/cards/:cardId/runs
GET /api/runs/:runId
GET /api/events/stream
```

Event stream examples:

```json
{ "type": "job.queued", "jobId": "job_123", "cardId": "FEAT-001" }
{ "type": "agent.started", "runId": "run_456", "agent": "requirements" }
{ "type": "question.created", "questionId": "q_789", "cardId": "FEAT-001" }
{ "type": "card.moved", "cardId": "FEAT-001", "toState": "Spec Review" }
```

### Verification

```http
POST /api/features/:featureId/verification-sessions
GET /api/features/:featureId/verification-sessions/current
POST /api/verification-sessions/:sessionId/feedback
POST /api/verification-sessions/:sessionId/accept
```

Feedback request:

```json
{
  "description": "The submit button stays disabled after entering valid data.",
  "expectedBehavior": "The button should become enabled once all required fields are valid.",
  "actualBehavior": "The button remains disabled.",
  "screenshotPath": "screenshots/FEAT-001/button-disabled.png",
  "severity": "blocking"
}
```

When feedback is submitted, the orchestrator moves the FEAT to `Agent Fixing` and queues `fix-from-feedback`.

### Git

```http
GET /api/features/:featureId/git-session
POST /api/features/:featureId/git-session/worktree
POST /api/features/:featureId/git-session/commit
POST /api/features/:featureId/git-session/prepare-push
POST /api/approvals/:approvalId/approve
POST /api/approvals/:approvalId/reject
```

Remote writes require approval.

## Dashboard Responsibilities

The dashboard should:

- Display boards and card state.
- Allow drag-and-drop state transitions.
- Show live run progress.
- Show one question at a time.
- Collect user answers.
- Display generated documents for review.
- Collect manual verification feedback and screenshots.
- Show git branch, worktree, and commit status.
- Provide pause, retry, cancel, and manual override controls.

The dashboard should not:

- Directly run agents.
- Directly move cards after agent completion without orchestrator validation.
- Store secrets.
- Infer hidden workflow transitions without the orchestrator.

## Orchestrator Responsibilities

The orchestrator should:

- Validate transitions.
- Queue jobs for trigger columns.
- Select agents and models.
- Persist events.
- Create questions.
- Resume jobs after answers.
- Move cards based on validated command results.
- Gate sensitive actions.
