# Migration From DevCycle MCP

## Decision

The new platform will not use DevCycle MCP at runtime.

Hepha should own workflow state, command results, recovery loops, and board
transitions directly. Pi agents execute focused workflow work with the context
Hepha provides. The existing DevCycle MCP repository is only a migration source
for prompts, lifecycle rules, MemoryBank conventions, quality gates, command
names, and autonomous handoff behavior.

## Source Material

When compatibility research is required, point `DEVCYCLE_SOURCE_PATH` at an
authorized local checkout of the legacy repository:

```text
DEVCYCLE_SOURCE_PATH=/workspace/legacy-development-process
```

Primary source folders:

```text
DevCycleManager/Prompts/
MemoryBank/
CLAUDE.md
README.md
```

## Migration Target

Each existing MCP recipe becomes a native workflow command, workflow gate, or
worker step. Names can change when the Hepha-native name better describes the
board-driven behavior.

| Old MCP Tool | New Native Command | Primary Agent |
| --- | --- | --- |
| `submit-epic` | `submit-epic` | Requirements Agent |
| `submit-feature` | `submit-feature` | Requirements Agent |
| `deep-dive` | `deep-dive` | Requirements Agent |
| `design-feature` | `design-feature` | Design Agent |
| `refine-feature` | `refine-feature` | Refinement Agent |
| `start-feature` | `start-implementing` | Orchestrator + Implementation Agent |
| `continue-implementation` | `continue-implementing` | Orchestrator + Implementation Agent |
| `code-review` | Code-review gate / worker | Code Review Agent |
| `accept-phase` | Phase acceptance gate inside implementation loop | Orchestrator + Test Agent |
| `complete-feature` | `complete-feature` | Documentation Agent |

## Reliability Contract From DevCycle MCP

The old DevCycle MCP was reliable because it behaved like a stateless recipe
book. A tool call returned one explicit procedure, marked the response as
`pending_execution`, and told the client LLM to execute the returned steps
locally instead of retrying the same tool call.

Hepha must preserve that property without keeping MCP as a runtime dependency:

- workflow YAML defines the visible ordered steps;
- SQLite records command, phase, task, review, question, and completion state;
- MemoryBank Markdown remains the portable project specification and audit
  trail;
- implementation phases resume from durable task checkboxes and Hepha task
  state, not from memory of a prior agent turn;
- code-review findings are saved, fixed in the same phase, reviewed again, and
  only then allowed to advance;
- an approved durable review advances to phase exit, including after restart;
- optional governance projections such as recurrence, fingerprints, replans,
  and architecture debt do not alter the Phase Executor unless an explicit
  reviewed workflow decision selects them;
- blockers are explicit and reserved for user decisions, unsafe actions,
  unavailable credentials/permissions, unresolved conflicts, or repeated
  documented recovery failure.

The normative transition contract and the justification required to change it
are documented in `docs/architecture/simple-phase-executor.md`.

## Conversion Rules

- Preserve lifecycle semantics and quality gates.
- Convert prompt templates into versioned command definitions.
- Replace MCP `structuredContent` with native command result objects.
- Replace `pending_execution` with explicit command run states.
- Replace MCP client-side procedure execution with orchestrator-owned workflow
  nodes and Pi worker prompts.
- Keep MemoryBank folder conventions until a better state store exists.
- Keep destructive actions approval-gated.

## Native Command Result Draft

```json
{
  "command": "submit-feature",
  "status": "completed",
  "agent": "requirements",
  "model": "deepseek-v4-pro",
  "outputs": [
    "MemoryBank/Features/01_SUBMITTED/FEAT-001-example/FeatureDescription.md"
  ],
  "nextActions": [
    "deep-dive",
    "design-feature"
  ],
  "blockers": []
}
```

## Restart Migration Approach

Redo the platform in small reliable slices. For each lifecycle operation, first
prove the native command contract, state transition, logs, and tests before
expanding autonomy.

Recommended slice shape:

1. Command/workflow definition.
2. Native command schema.
3. Deterministic orchestrator state transition.
4. Pi prompt or deterministic worker operation.
5. Filesystem output behavior.
6. Run log and dashboard-visible status.
7. Tests around routing, result shape, duplicate-run protection, and recovery.
