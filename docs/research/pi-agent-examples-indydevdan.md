# Pi Agent Examples: IndyDevDan Research Notes

## Sources Checked

Primary sources:

- GitHub: [disler/pi-vs-claude-code](https://github.com/disler/pi-vs-claude-code)
- Video: [The Pi Coding Agent: The ONLY REAL Claude Code COMPETITOR](https://www.youtube.com/watch?v=f8cfH5XX-XU)
- Channel: [IndyDevDan videos](https://www.youtube.com/@indydevdan/videos)
- Pi docs: [Extensions](https://pi.dev/docs/latest/extensions), [JSON Event Stream Mode](https://pi.dev/docs/latest/json), [SDK](https://pi.dev/docs/latest/sdk), [RPC Mode](https://pi.dev/docs/latest/rpc)

Related videos found from the channel/search metadata:

- [Pi to Pi: Two-Way Agent Orchestration with the Pi Coding Agent](https://www.youtube.com/watch?v=PIdETjcXNIk)
- [My Pi Agent Teams. Claude Code Leak SIGNAL. Harness Engineering](https://www.youtube.com/watch?v=RairMJflUSA)
- [One Agent Is NOT ENOUGH: Agentic Coding BEYOND Claude Code](https://www.youtube.com/watch?v=M30gp1315Y4)
- [Engineers, DELETE the BASH Tool: Agentic Security For Pi Agent and Claude Code](https://www.youtube.com/watch?v=yBcmIoA-vGs)
- [GPT-5.5 VERIFIED Opus 4.7: A Pi Coding Agent That REVIEWS Like YOU](https://www.youtube.com/watch?v=EnXKysJNz_8)
- [Pi Coding Agent Observability: HTML Specs with Gemini 3.5 Flash and GPT Image 2](https://www.youtube.com/watch?v=o4KZH_KSqYQ)
- [Pi CEO Agents. Claude 1M Context. Multi-Agent Teams.](https://www.youtube.com/watch?v=TqjmTZRL31E)

Note: the GitHub repository was cloned locally for source inspection under the parent workspace temp folder. The YouTube pages were used for title/channel metadata; the implementation details below come primarily from the repository and Pi docs.

## What The Example Repository Is

`pi-vs-claude-code` is a Pi extension playground. It demonstrates custom agent harness patterns rather than one production application.

The most relevant parts for this project:

- `.pi/agents/*.md`: specialist agent definitions with frontmatter.
- `.pi/agents/teams.yaml`: named agent teams.
- `.pi/agents/agent-chain.yaml`: sequential pipelines.
- `extensions/agent-team.ts`: dispatcher that delegates work to specialist Pi processes.
- `extensions/agent-chain.ts`: sequential workflow pipeline.
- `extensions/subagent-widget.ts`: background subagent spawning and JSON event parsing.
- `extensions/damage-control*.ts`: safety interception for dangerous tools/paths.
- `extensions/coms*.ts` and `scripts/coms-net-server.ts`: Pi-to-Pi messaging.
- `specs/agent-workflow.md`: persistent state-machine idea called "The Chronicle".

## Implementation Patterns Worth Reusing

### 1. Agent Definitions As Markdown With Frontmatter

The example uses small `.md` files with frontmatter such as:

```yaml
name: planner
description: Architecture and implementation planning
tools: read,grep,find,ls
```

Then the body is the agent persona/system prompt.

Decision for our project:

- Use this pattern for our agents.
- Store agent definitions under something like `agents/*.md` or `.agentic/agents/*.md`.
- Include explicit tool permissions, default model policy, and output schema reference.

### 2. Teams And Chains As Declarative YAML

The example has:

- `teams.yaml` for dynamic dispatcher teams.
- `agent-chain.yaml` for sequential pipelines where one agent output becomes the next agent input.

Decision for our project:

- Use declarative workflow definitions, but controlled by our orchestrator.
- EPIC/FEAT Kanban transitions should map to orchestrator commands.
- Commands can internally use chains such as `requirements -> reviewer` or `planner -> developer -> reviewer`.

### 3. Spawn Pi In JSON Mode For Worker Agents

The example frequently spawns worker agents with a shape like:

```text
pi --mode json -p --no-extensions --model <model> --tools <tools> --append-system-prompt <prompt> --session <session-file> <task>
```

It then parses JSON lines for events such as:

- `message_update`
- `tool_execution_start`
- `message_end`
- `agent_end`

Decision for our project:

- This is the strongest fit for v1.
- The Node orchestrator can spawn Pi in JSON mode for isolated worker runs.
- Parse JSONL events and persist them to SQLite.
- Stream those events to the dashboard with SSE.

Alternative:

- Pi SDK is cleaner long term for direct TypeScript embedding.
- JSON mode is simpler for the first working orchestrator because it isolates workers as child processes and mirrors proven example code.

### 4. Keep Worker Agent Sessions Separate

The examples give each subagent or chain agent its own session file. This avoids one giant shared context and allows targeted continuation.

Decision for our project:

- Each agent run should have its own session file.
- Long-lived specialist agents may resume within a FEAT or EPIC scope.
- The orchestrator ledger, not the Pi session, remains the source of truth.

### 5. Safety Rules As Data

The damage-control examples load YAML rules for:

- Dangerous bash command patterns.
- Zero-access paths such as `.env` and credentials.
- Read-only paths such as lockfiles or system folders.
- No-delete paths such as `.git/`, `README.md`, and project config.

Decision for our project:

- Create an orchestrator-level safety policy before any autonomous implementation work.
- Use YAML or JSON rules.
- Gate remote writes and broad destructive actions in the dashboard.
- Prefer "blocked with actionable feedback" over abruptly killing the run, so agents can adapt safely.

### 6. The Chronicle State-Machine Idea

The repository includes a spec for a persistent supervisor with:

- Ledger file.
- State machine.
- State-specific subagents.
- Context handoff snapshots.
- Explicit transitions.
- Anti-looping controls.
- Budget controls.
- Cleanup between states.

Decision for our project:

- This maps directly to our orchestrator.
- Our version should use SQLite as the ledger, plus MemoryBank files for durable artifacts.
- Kanban columns become workflow states.
- Agent runs must return structured results that the orchestrator validates before moving cards.

### 7. Pi-To-Pi Messaging Is Interesting, But Not V1

The `coms` and `coms-net` examples show same-machine and HTTP/SSE agent messaging.

Decision for our project:

- Do not start with free peer-to-peer agent messaging.
- Keep the orchestrator as the central scheduler and state authority in v1.
- Revisit Pi-to-Pi messaging later for specialist consultation patterns, such as Reviewer asking Developer for clarification or Production Agent talking to Dev Agent.

## What To Avoid

- Do not build the primary product as only a Pi terminal extension.
- Do not rely on a primary Pi agent to be the source of truth.
- Do not let agent-to-agent chatter move workflow state directly.
- Do not start with peer-to-peer communication before the orchestrator ledger is reliable.
- Do not run autonomous implementation without safety rules and Git isolation.

## Recommended Architecture Adjustment

Before this research, the design already had a dashboard and orchestrator. The example repository strengthens that direction.

Updated recommendation:

```text
Dashboard
  Kanban state, questions, verification feedback, approvals
        |
        v
Node/TypeScript Orchestrator
  SQLite ledger, queue, safety, model routing, Git/worktree manager
        |
        v
Pi Worker Adapter
  spawns pi --mode json worker processes
        |
        v
Specialist agents
  markdown definitions + isolated session files
```

The key point: Pi is the worker harness, not the product UI. Our dashboard is the product UI.

## First Concrete Prototype Suggested By This Research

Build a `PiWorkerAdapter` that can:

1. Load one agent definition from markdown frontmatter.
2. Spawn `pi --mode json`.
3. Pass a task prompt.
4. Parse JSONL events.
5. Save events to a run log.
6. Return a structured result to the orchestrator.

Then connect it to one board trigger:

```text
FEAT moved to Clarify
  -> queue deep-dive-feature
  -> run Requirements Agent through PiWorkerAdapter
  -> create one question
  -> dashboard shows the question
```

## Open Questions

- Should v1 use Pi SDK directly or spawn `pi --mode json`?
- Should agent definitions live in `.agentic/agents/` or `agents/`?
- Should Pi session files be stored inside `.agentic/sessions/` or outside the project tree?
- How much worker state should be resumable versus reconstructed from SQLite and MemoryBank?
- Should the dashboard expose raw Pi events or only summarized orchestrator events?
