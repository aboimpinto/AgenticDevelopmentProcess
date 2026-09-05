# Pi Package Catalog Watchlist

Reviewed on June 9, 2026. Updated on June 19, 2026 for workflow orchestration
packages. Updated on June 28, 2026 for the Pi skills/extensions and Hepha
second-brain boundary.

This is a curated watchlist for Hepha, not a complete mirror of the Pi package catalog. The goal is to identify Pi packages, skills, extensions, themes, and prompts that could help the Agentic Development Process later, while keeping the orchestrator as the product source of truth.

Sources:

- Pi package catalog: https://pi.dev/packages
- pi-subagents: https://pi.dev/packages/pi-subagents
- pi-web-access: https://pi.dev/packages/pi-web-access
- AskUserQuestion: https://pi.dev/packages/@juicesharp/rpiv-ask-user-question
- pi-playwright: https://pi.dev/packages/pi-playwright
- pi-agent-browser-native: https://pi.dev/packages/pi-agent-browser-native
- pi-browse: https://pi.dev/packages/pi-browse
- pi-codex: https://pi.dev/packages/pi-codex
- pi-kanban: https://pi.dev/packages/pi-kanban
- pi-resource-center: https://pi.dev/packages/pi-resource-center
- pi-skillful: https://pi.dev/packages/pi-skillful
- rpiv-pi: https://pi.dev/packages/@juicesharp/rpiv-pi
- rpiv-todo: https://pi.dev/packages/@juicesharp/rpiv-todo
- rpiv-web-tools: https://pi.dev/packages/@juicesharp/rpiv-web-tools
- pi-lens: https://pi.dev/packages/pi-lens
- pi-hermes-memory: https://pi.dev/packages/pi-hermes-memory
- pi-chrome: https://pi.dev/packages/pi-chrome
- pi-browser-debug: https://pi.dev/packages/pi-browser-debug
- pi-tool-stats: https://pi.dev/packages/pi-tool-stats
- safe-coder: https://pi.dev/packages/safe-coder
- agent-skills: https://pi.dev/packages/@chankov/agent-skills
- zero-pi: https://pi.dev/packages/@gonrocca/zero-pi
- gentle-pi: https://pi.dev/packages/gentle-pi
- pi-extension-template: https://pi.dev/packages/pi-extension-template
- pi-agent-dashboard: https://pi.dev/packages/@blackbelt-technology/pi-agent-dashboard
- Raindrop Pi agent: https://pi.dev/packages/@raindrop-ai/pi-agent
- pi-workflows: https://pi.dev/packages/@davidorex/pi-workflows
- pi-project-workflows: https://pi.dev/packages/@davidorex/pi-project-workflows
- Cole Medin Pi live build: https://www.youtube.com/watch?v=lK9o5Wu2upU

## Catalog Structure

Pi packages can contain one or more resource types:

- `extension`: TypeScript runtime code loaded by Pi. Highest power and highest risk.
- `skill`: reusable workflow instructions. Useful for repeatable development behavior.
- `prompt`: slash-command or template prompt material. Useful as source material for our command definitions.
- `theme`: terminal UI presentation. Useful only for local Pi ergonomics.
- `package`: installable bundle or utility that may expose any combination of the above.

The catalog changes quickly. Re-check package pages, source repositories, and installed versions before adopting anything into a real workflow.

## Adoption Rules

Use this policy before installing any Pi package into a normal working profile:

- Review the package source, especially `extensions/`, before installation.
- Prefer a disposable Pi profile or test project first.
- Pin versions for repeatable installs, for example `pi install npm:package@x.y.z`.
- Record package name, version, source repository, capabilities, and required API keys.
- Treat packages with browser, filesystem, shell, Git, network, or credential access as privileged code.
- Do not give a package direct authority to move Hepha cards, write orchestrator database rows, or push Git changes.
- Emit events from package-driven work into the orchestrator trace so the dashboard remains auditable.

## Immediate V1 Candidates

These are the strongest candidates for the first real Pi-backed vertical slices.

| Candidate | Type | Install | Why It Matters | Hepha Decision |
| --- | --- | --- | --- | --- |
| `pi-subagents` | extension, skill, prompt | `pi install npm:pi-subagents` | Delegates work to focused child agents, supports chains, parallel execution, background runs, reviewer/planner/worker roles, and project-level agent definitions. | High priority. Evaluate for worker fan-out after the first single Pi worker adapter is stable. The orchestrator still owns job state. |
| `@juicesharp/rpiv-ask-user-question` | extension | `pi install npm:@juicesharp/rpiv-ask-user-question` | Gives Pi a structured `ask_user_question` tool with typed options, previews, notes, multi-select, and review before submit. | High priority. Strong fit for the dashboard "Waiting for user" state. Decide whether to call it directly or translate it into Hepha-native questions. |
| `pi-web-access` | extension, skill | `pi install npm:pi-web-access` | Adds web search, URL fetch, GitHub repo cloning, PDF extraction, YouTube/local video understanding, code search, and a bundled librarian skill. | High priority with guardrails. Use for research agents, docs lookups, and source gathering. Disable broad cookie/browser access by default. |
| `pi-playwright` | skill package | `pi install npm:pi-playwright` | Playwright browser automation package for Pi, useful for screenshots, browser verification, and local UI testing. | High priority candidate, but re-check before install. The Pi package page returned an internal server error during this review; npm metadata showed version `0.1.1` and repository `https://github.com/guwidoe/pi-playwright.git`. |
| `pi-agent-browser-native` | extension | `pi install npm:pi-agent-browser-native` | Native browser tool for Pi agents to open pages, inspect, click, snapshot, screenshot, and work with persistent profiles. | Compare directly against `pi-playwright`. Prefer one browser automation path for v1 to avoid duplicate debugging surfaces. |

## Strong Follow-Up Candidates

| Candidate | Type | Install | Why It Matters | Hepha Decision |
| --- | --- | --- | --- | --- |
| `@juicesharp/rpiv-todo` | extension | `pi install npm:@juicesharp/rpiv-todo` | Persistent todo overlay and `todo` tool that survives reload and compaction. | Useful as inspiration for per-run tasks, but Hepha should persist todos in SQLite. |
| `@juicesharp/rpiv-pi` | extension, skill | `pi install npm:@juicesharp/rpiv-pi` | Skill-based development pipeline: discover, research, design, plan, implement, validate, with artifacts and specialist agents. | Study carefully. It overlaps heavily with our workflow lifecycle, so adopt ideas before adopting runtime ownership. |
| `@juicesharp/rpiv-web-tools` | extension | `pi install npm:@juicesharp/rpiv-web-tools` | Smaller web search/fetch tool set with multiple providers and interactive provider setup. | Alternative to `pi-web-access`. Prefer the smaller tool if we only need search and fetch. |
| `pi-lens` | extension, skill | `pi install npm:pi-lens` | LSP, lint, formatter, typecheck, structural analysis, and real-time inline code feedback for agents. | Strong verification candidate once implementation agents start editing code. |
| `pi-codex` | extension, skill, prompt | `pi install npm:pi-codex` | Uses Codex from inside Pi for review, adversarial review, rescue tasks, status/result/cancel commands. | Useful for review and rescue lanes. Be careful with nested agent control and background jobs. |
| `pi-hermes-memory` | extension | `pi install npm:pi-hermes-memory` | Persistent memory, conversation search, failure memory, categorized memories, procedural skills, and secret scanning. | Interesting, but keep project memory policy explicit. Avoid storing private client context by default. |
| `pi-kanban` | extension | `pi install npm:pi-kanban` | Dashboard for Pi sessions, todos, subagents, and observability. | Study for UX and data ideas. Do not replace Hepha, because Hepha needs product-specific EPIC/FEAT state. |
| `@blackbelt-technology/pi-agent-dashboard` | extension | `pi install npm:@blackbelt-technology/pi-agent-dashboard` | Browser dashboard for commanding multiple Pi agents and watching reasoning live. | Study as comparable product surface and agent-dashboard precedent. |
| `@raindrop-ai/pi-agent` | extension | `pi install npm:@raindrop-ai/pi-agent` | Observability integration for agent runs, LLM generations, tool calls, token usage. | Useful comparison for telemetry model, but external SaaS telemetry needs explicit opt-in. |
| `pi-tool-stats` | extension | `pi install npm:pi-tool-stats` | Tracks skill, prompt, extension, built-in tool usage, model/tool failure hotspots, and prune candidates. | Useful for local Pi hygiene and future package usage analytics. |
| `pi-resource-center` | extension | `pi install npm:pi-resource-center` | TUI for browsing, enabling, disabling, pinning, exposing, updating, and applying packages, skills, extensions, prompts, and themes. | Good local admin tool. Could help manage crowded Pi profiles while we evaluate packages. |
| `pi-skillful` | extension | `pi install npm:pi-skillful` | Inline `/skill:name` invocation, skill visibility control, and session skill toggles. | Useful when the skill list grows and context pollution becomes a problem. |
| `pi-chrome` | extension | `pi install npm:pi-chrome` | Uses an explicitly authorized signed-in Chrome profile through a loopback bridge. | Powerful but sensitive. Only evaluate after browser automation security rules are documented. |
| `pi-browser-debug` | extension | `pi install npm:pi-browser-debug` | Chrome DevTools Protocol tools for console logs, network, eval, storage, accessibility snapshots, clicks, fills, and screenshots. | Useful for debugging local apps, but likely a follow-up after choosing Playwright or native browser control. |
| `pi-browse` | extension | `pi install npm:pi-browse` | Web search, content extraction, deep research, GitHub search, and Playwright-based dynamic content support. | Alternative to `pi-web-access` and `rpiv-web-tools`. Compare provider model and safety controls. |
| `pi-browser-tools` | extension | `pi install npm:pi-browser-tools` | Playwright browser tools with shared Chromium across sessions. | Compare with `pi-playwright` and `pi-agent-browser-native`; avoid installing several browser stacks at once. |

## Workflow And Discipline Packages

These packages are interesting but could take over too much of the workflow if adopted blindly.

| Candidate | Type | Install | Why It Matters | Hepha Decision |
| --- | --- | --- | --- | --- |
| `@davidorex/pi-workflows` | extension, skill | `pi install npm:@davidorex/pi-context@0.31.0` then `pi install npm:@davidorex/pi-workflows@0.31.0` | YAML workflow specs, typed JSON step outputs, agent subprocesses, checkpoint/resume, workflow status, validation, and `.workflows/` discovery. | Best candidate for a future Pi-native workflow backend. Do not install into the normal profile until the extension source is reviewed. Hepha V1 now has its own `.workflows/*.workflow.yaml` runner and keeps SQLite/card state authority. |
| `@davidorex/pi-project-workflows` | extension, skill | `pi install npm:@davidorex/pi-project-workflows@0.31.0` | Convenience meta-package that installs context, workflows, behavior monitors, agent dispatch, and shared JIT agent support. | Useful for a disposable evaluation profile. Too broad for immediate Hepha adoption because it installs more authority than workflow execution alone. |
| `@chankov/agent-skills` | extension, skill, prompt | `pi install npm:@chankov/agent-skills` | Production engineering skills and slash commands for define, plan, build, verify, review, and ship. | Good source material for our skill library. Do not install until we compare command names with our lifecycle. |
| `gentle-pi` | extension, skill, prompt | `pi install npm:gentle-pi` | Spec-driven development harness with subagents, TDD evidence, review guardrails, and skill discovery. | Study for workflow discipline and review gates. It overlaps with Hepha's purpose. |
| `@gonrocca/zero-pi` | extension, skill, theme, prompt | `pi install npm:@gonrocca/zero-pi` | Spec-driven pipeline: explore, plan, build, veredicto, with model tuning and guard extensions. | Study for phase model and validation loop. Avoid adopting as the primary orchestrator. |
| `safe-coder` | extension, skill, theme, prompt | `pi install npm:safe-coder` | Permission gates, workspace boundary enforcement, protected `.env`, `.git`, and `node_modules` paths. | Very relevant. Review source and possibly copy the guardrail ideas into Hepha's own safety policy. |
| `pi-extension-template` | extension, skill, theme, prompt | `pi install npm:pi-extension-template` | Template for building Pi packages with extensions, skills, prompts, and themes. | Useful when we publish our own Hepha Pi companion package. |

## Category Notes

### Packages And Extensions

Extensions are the most useful and risky category. They can execute code and influence agent behavior. For Hepha, extensions should be treated like dependencies with runtime privileges, not like passive prompt text.

Recommended adoption order:

1. `pi-subagents`
2. `@juicesharp/rpiv-ask-user-question`
3. One browser automation stack: `pi-playwright`, `pi-agent-browser-native`, or `pi-browser-tools`
4. One web access stack: `pi-web-access`, `@juicesharp/rpiv-web-tools`, or `pi-browse`
5. One safety/verification stack: `safe-coder`, `pi-lens`, or selected guardrail code from each

### Skills

Skills are valuable as repeatable workflow material. For this project, the best use is to read them, extract patterns, and convert the good parts into Hepha-native agent definitions.

Watch for skills around:

- requirements discovery
- deep research
- design review
- implementation planning
- code review
- test strategy
- browser verification
- release notes and handoff

### Prompts

Prompts are useful as source material for workflow commands and subagent roles. They should not become a hidden runtime dependency for critical Hepha state transitions.

Prompts worth collecting:

- parallel review
- review loop
- context gathering
- research plus local code scan
- implementation handoff
- adversarial review
- rescue/debug task

### Themes

Themes are low priority. They may help make local Pi sessions visually match Hepha, but they do not affect the dashboard product or agent runtime quality.

Use themes only after the functional workflow is stable.

## Fit With Hepha

Pi packages should be worker capabilities. Hepha remains the state authority.

The adoption heuristic from the Archon/Pi direction is:

```text
Skills carry reusable workflow knowledge.
Extensions provide runtime hands.
Hepha owns state, policy, receipts, and cross-project memory selection.
```

Rules:

- Card movement is owned by the orchestrator.
- Job claiming is owned by the orchestrator.
- Agent packages can produce artifacts, questions, logs, screenshots, and recommendations.
- Agent packages should not directly write the orchestrator database.
- Every package-driven action should emit trace events.
- Human-facing questions should become dashboard questions, even if the original source is a Pi TUI tool.
- Browser and web access need explicit run-level permission.

## Suggested Evaluation Backlog

1. Create a disposable Pi profile for package tests.
2. Install `pi-subagents` and run one read-only scout/reviewer workflow.
3. Install `@juicesharp/rpiv-ask-user-question` and map its result shape to Hepha's question model.
4. Re-check `pi-playwright` on pi.dev, then compare it with `pi-agent-browser-native` using a local Vite app.
5. Compare `pi-web-access`, `rpiv-web-tools`, and `pi-browse` on the same documentation research task.
6. Review `safe-coder` source and extract safety rules for Hepha.
7. Review `pi-lens` once the worker adapter can run real code changes.
8. Review `rpiv-pi`, `gentle-pi`, and `zero-pi` for workflow ideas, but keep Hepha's lifecycle names and state model.
9. Use `pi-tool-stats` or similar telemetry to understand which Pi resources are actually used after several weeks.
10. Build a small Hepha companion package later, using `pi-extension-template`, only if the orchestrator needs a native Pi-side extension.

## Open Questions

- Should `@juicesharp/rpiv-ask-user-question` be used directly, or should Hepha provide its own structured question tool for Pi workers?
- Which browser automation path should be standard: Playwright package, native browser tool, Chrome bridge, or CDP debug extension?
- Which web access package has the best safety model for client work?
- Should Hepha store package install state per project, per user, or per agent profile?
- How should package versions and package-origin metadata be shown in the run summary?
- Do we want one local Pi profile for all projects, or a separate Pi profile per client/project to reduce cross-contamination?
