# Hepha Working Session Notes - 2026-06-10

These notes capture the product and implementation decisions from the first Hepha dashboard working session.

## Context

The repository started as `AgenticDevelopmentProcess`, which remains the formal project name. During the session, we chose `Hepha` as the shorter product name, inspired by Hephaestus, the Olympian god of the forge, craft, and builders.

The goal is not to create another generic chat UI. Hepha is the control surface for a software development lifecycle where EPICs, FEATs, phases, and tasks move through explicit workflow states, and specialist Pi agents perform the work behind those state changes.

## Source Material

The first UI reference came from a Google Stitch prototype exported into:

- `Assets/DESIGN.md`
- `Assets/code.html`

Brand assets were added to:

- `apps/web/public/brand/hepha-app-icon.png`
- `apps/web/public/brand/hepha-logo-mark-transparent.png`

The prototype established the current visual direction:

- dark operations-console surface
- amber primary actions and borders
- cyan live-state accents
- right-side detail blade
- board-centered operating model
- live run timeline and run summary

## Environment And Keys

OpenAI and DeepSeek credentials must stay outside git.

Recommended Windows user environment setup:

```powershell
[Environment]::SetEnvironmentVariable("OPENAI_API_KEY", "<your-openai-key>", "User")
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "<your-deepseek-key>", "User")
```

The orchestrator should read credentials from:

1. the current process environment
2. an ignored local `.env` file
3. the Windows user environment registry values

The dashboard and orchestrator must never print the key values. Health checks should report only boolean key presence.

## Pi Package Research

The Pi package catalog at `https://pi.dev/packages` is important future input. The first watchlist is documented in:

- `docs/research/pi-package-catalog-watchlist.md`

High-priority packages and capabilities for future evaluation:

- `pi-subagents` for specialist worker fan-out
- `pi-web-access` for controlled web access
- `@juicesharp/rpiv-ask-user-question` for structured agent questions
- `pi-playwright` for browser verification and screenshots
- observability packages for run traces, timing, and tool events

Decision: Pi packages should be worker capabilities. Hepha remains the workflow state authority.

## Smoke Test Slice

The first implemented slice was an intentionally small "Random agent spin" flow:

```text
Dashboard
  -> Orchestrator API
  -> Pi process
  -> DeepSeek model
  -> task output back into the dashboard blade
```

This slice proved that the local dashboard can create a FEAT card, move it to execution, spawn a real Pi worker process, stream status back to the UI, and show the model output in the task detail blade.

The smoke test is useful, but it should not define the product. Ad-hoc prompt execution should remain a development, diagnostics, or later admin utility. The main product workflow is lifecycle orchestration.

## Runtime Findings

### Dev Startup

Running `pnpm dev` inside `apps/web` starts only Vite and causes proxy failures:

```text
connect ECONNREFUSED 127.0.0.1:4317
```

The correct command is from the repository root:

```powershell
pnpm dev
```

The root dev script starts the orchestrator first, waits for `/api/health`, then starts the web app.

### DeepSeek Model IDs

The original `deepseek-chat` model id caused Pi to print:

```text
Warning: Model "deepseek-chat" not found for provider "deepseek". Using custom model id.
```

The correct fast model for the current Pi provider is:

```text
deepseek-v4-flash
```

The preferred model routing is:

- `deepseek-v4-flash` for fast routine work, summaries, and smoke tests
- `deepseek-v4-pro` for planning, architecture, and review
- OpenAI/Codex models for implementation-heavy code work

### Pi Process Behavior

The dashboard run initially waited much longer than a direct console command. The important fixes were:

- spawn Pi in JSON mode so the orchestrator can parse live events
- close child stdin immediately after spawning the process
- use `--no-session` for the early ephemeral worker run
- disable unnecessary version and telemetry checks in the child environment
- capture stderr and expose diagnostics in the task timeline
- add timeout, heartbeat, and cancel handling to the dashboard

Direct console validation command:

```powershell
pi --provider deepseek --model deepseek-v4-flash --mode text --print --no-tools --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files --no-approve "Tell me how you are, and answer briefly."
```

Expected result: a short model answer with no unknown-model warning.

## Product Direction

Hepha should model the full development workflow:

```text
EPIC
  -> deep dive
  -> FEAT extraction
  -> phase planning
  -> task execution
  -> implementation
  -> review
  -> verification
  -> completion evidence
```

The dashboard should make this workflow visible and controllable without turning it into a manual command launcher.

Core objects:

| Object | Purpose |
| --- | --- |
| EPIC | Strategic initiative or larger product outcome. |
| FEAT | Concrete feature derived from an EPIC or created directly. |
| Phase | Planned implementation segment inside a FEAT. |
| Task | Executable unit assigned to an agent. |
| Agent Run | One Pi-backed execution attempt with model, prompt, events, and output. |
| Artifact | Generated spec, design, plan, review, test result, or completion note. |
| Question | Structured clarification request from an agent to the user. |
| Verification Evidence | Screenshots, notes, test output, and approval records. |

## Workflow Principle

State changes should drive work.

The expected interaction model is:

1. User creates or selects an EPIC or FEAT.
2. User moves the card into a workflow trigger state.
3. Orchestrator validates the transition.
4. Orchestrator queues the correct specialist agent job.
5. Agent runs until it completes, fails, blocks, or asks a question.
6. Dashboard shows the live timeline, generated artifacts, questions, and next action.
7. User reviews or answers only where human judgment is required.

The user should not need to click every lifecycle command manually.

## Near-Term Product Slice

The next real slice should move from ad-hoc agent execution to project and
MemoryBank-driven workflow:

1. Register a project with root path and MemoryBank path.
2. Initialize the MemoryBank folder structure when `Features/` is missing.
3. Scan existing `00_EPICS` and FEAT state folders into board columns.
4. Show the latest `EpicDescription.md` or `FeatureDescription.md` from disk.
5. Keep the UI fresh when EPIC/FEAT documents are edited outside Hepha.
6. Select a FEAT and continue into clarification, design/refinement, phase planning, and task execution.
7. Add EPIC deep-dive and FEAT extraction after the project import/sync path is reliable.

## Non-Goals

For the first version, Hepha should not become:

- a generic chat replacement
- an arbitrary prompt launcher as the main user experience
- an uncontrolled autonomous coding tool
- a Pi package catalog clone
- a cloud-hosted multi-user system

## Open Questions

- Should the ad-hoc agent run stay as a visible admin button or move behind a diagnostics view?
- How much of the Pi raw event stream should be visible by default?
- Should v1 persist runs in SQLite before adding EPIC deep-dive automation?
- Should `@juicesharp/rpiv-ask-user-question` be translated into Hepha-native dashboard questions or used directly?
- What is the first canonical EPIC we should use as the real end-to-end test?

## Current Working Decision

Keep the smoke-test agent run because it proves the runtime path, but move it
behind diagnostics/admin UI. Shift the product roadmap immediately toward
project registration, MemoryBank synchronization, and EPIC/FEAT lifecycle
orchestration.
