# Hepha AI Development Video Lessons

Reviewed on June 28, 2026.

## Purpose

This note captures lessons for Hepha from selected AI-development videos across:

- [Cole Medin](https://www.youtube.com/@ColeMedin/videos)
- [IndyDevDan](https://www.youtube.com/@indydevdan/videos)
- [Nate B Jones](https://www.youtube.com/@NateBJones/videos)

The goal is not to copy another creator's workflow. The goal is to extract ideas
that strengthen Hepha as a local-first development harness for Paulo's
EPIC -> FEAT -> Phase -> Task process.

## Research Scope

I scanned the latest channel video inventories and selected 57 videos whose
titles and captions were directly relevant to AI-assisted software development,
agent harnesses, agent teams, planning, context engineering, skills, safety,
observability, orchestration, and review bottlenecks.

For the selected videos, I checked YouTube metadata and available English
captions. This document summarizes lessons in original wording and does not
store transcripts.

## Executive Synthesis

Across all three channels, the strongest shared message is that the model is not
the product. The product is the system around the model:

- the work unit,
- the context pack,
- the tool boundary,
- the workflow state,
- the review loop,
- the trace,
- the safety gate,
- the handoff receipt,
- the learning loop.

For Hepha, that means the next level is not "more agents." The next level is a
better development operating system where agents are replaceable workers inside
a deterministic, observable, recoverable harness.

## Hepha Principles To Promote

### 1. Hepha Owns The Work Unit

Several videos frame the failure mode as "chat is not work." A prompt is only a
request. A useful agent workflow needs a durable work unit with state, context,
history, outputs, review, and acceptance.

Hepha should treat each EPIC, FEAT, phase, and task as a work unit with:

- source document path,
- workflow state,
- current owner,
- context bundle,
- required artifacts,
- run receipts,
- review findings,
- verification evidence,
- human decisions,
- final acceptance state.

The dashboard should make the work unit visible. The chat transcript is only one
input to that work unit, not the source of truth.

### 2. Hepha Is A Harness, Not A Chat Wrapper

Cole Medin and IndyDevDan both push the same direction: harness engineering is
the control layer around coding agents. A harness decides what runs, which
context is loaded, which tools are allowed, which gates must pass, and what
happens after failure.

For Hepha, the harness layer should own:

- workflow YAML,
- command templates,
- agent definitions,
- context packs,
- output schemas,
- safety policies,
- verification profiles,
- event traces,
- LessonsLearned promotion.

Pi, Codex, Claude, or any other agent should be worker adapters behind the same
Hepha contract.

### 3. Planning, Implementation, And Validation Must Be Separate

The strongest engineering workflow pattern is still simple:

```text
Plan -> Implement -> Validate -> Learn
```

The important part is separation. The same agent session should not blur a vague
idea, an implementation plan, code edits, review, and acceptance into one
uninspectable thread.

Hepha already has this shape with deep-dive, design, refine, implementation,
code review, verification, and completion. The next step is to make each boundary
machine-checkable:

- planning artifacts must be reviewed before implementation,
- implementation runs must produce receipts,
- review findings must become a structured ledger,
- verification results must attach to the work unit,
- lessons must be promoted only after review.

### 4. Context Engineering Is A Deterministic Product Feature

The videos repeatedly argue that agents fail when they receive the wrong context,
too much context, stale context, or no source-of-truth context.

Hepha should make context packs first-class product objects:

- deterministic selectors,
- required and optional source files,
- context hashes,
- redaction rules,
- size limits,
- project policy injection,
- active LessonsLearned injection,
- stale-context detection.

This also argues against a generic "RAG will solve it" approach. Hepha should
start with explicit file/context selection and only use search or embeddings as
helpers inside a controlled context policy.

### 5. Skills Are Versioned Workflow Assets

Prompts are one-off requests. Skills are repeatable procedures with inputs,
tools, constraints, and expected outputs.

Hepha already has `.hepha/commands/` and `.hepha/agents/`. The next logical
addition is a skills layer:

```text
.hepha/
  skills/
    plan-feature.skill.md
    implement-phase.skill.md
    review-phase.skill.md
    repair-review-findings.skill.md
```

Each skill should name:

- purpose,
- allowed inputs,
- tool profile,
- required reads,
- allowed writes,
- output schema,
- stop conditions,
- gate checks.

This keeps process knowledge portable across Pi, Codex, Claude, and future
agent adapters.

### 6. Agent Teams Need A Central Ledger

Agent teams are useful when the roles are bounded. They become dangerous when
agent-to-agent conversation silently changes state.

Hepha should use this topology:

```text
Hepha Orchestrator
  -> Lead Agent
     -> Worker Agent
     -> Reviewer Agent
     -> Specialist Agent
```

The orchestrator owns state transitions. Leads may plan and delegate. Workers
may edit inside their domain. Reviewers may block or approve. No agent should
move a Kanban card, mark a phase complete, or accept a finding without Hepha
recording the decision.

### 7. Observability Is Product Infrastructure

The observability videos and incident stories point to the same rule: if the
system cannot show what an agent did, it cannot be trusted at scale.

Hepha should record normalized events for:

- agent starts and stops,
- model choices,
- context bundles,
- tool calls,
- file changes,
- command results,
- safety blocks,
- review findings,
- retries,
- human decisions,
- token and wall-clock cost,
- final run receipts.

The dashboard should expose both engineering traces and product metrics:

- time in planning,
- time in implementation,
- time in review,
- recovery loop count,
- context-miss count,
- user-decision count,
- review bottleneck time,
- final verification status.

### 8. Safety Must Be A Runtime Contract

The safety material is blunt: a powerful agent with broad shell access is not a
safe default.

Hepha should add tool profiles before increasing autonomy:

- read-only discovery profile,
- documentation-only profile,
- test-running profile,
- source-editing profile,
- restricted shell profile,
- privileged shell profile behind approval,
- git write profile behind workflow state,
- push/release profile behind explicit user approval.

Dangerous operations should be routed through a Hepha command gateway instead
of raw agent shell habits. The gateway can allow project-specific commands while
blocking destructive patterns, sensitive paths, production credentials, and
unapproved network or deployment operations.

### 9. Review Capacity Is The New Bottleneck

Nate B Jones frames a common organizational problem: agents increase production
faster than humans increase review capacity.

For Hepha, this supports the existing PlanReviewer and scoped code-review
direction. It also means Hepha should measure review throughput:

- how many findings are blocker vs note,
- how often findings repeat,
- how many recovery passes are needed,
- how often the human must intervene,
- whether review is validating work or discovering basic evidence hygiene.

Hepha should optimize the review system, not just the coding system.

### 10. Learning Must Be Curated, Not Magical

Several videos point toward self-learning agents, memory, and agent experts. The
safe Hepha version is not unbounded memory. It is reviewed promotion from raw
failure patterns into active LessonsLearned rules.

Hepha should distinguish:

- raw run traces,
- review findings,
- repeated failure candidates,
- proposed lessons,
- approved active rules,
- deprecated rules.

An agent may propose a lesson. Hepha should not silently activate it without a
review gate.

## Next-Level Hepha Roadmap

### Milestone 1: Work Unit Receipts

Add a durable receipt for every agent run:

- work unit id,
- workflow node,
- agent role,
- model,
- tool profile,
- context bundle hashes,
- files read,
- files changed,
- commands run,
- artifacts produced,
- review status,
- verification status,
- unresolved questions,
- next recommended action.

This creates the "handoff receipt" needed for multi-agent and multi-tool work.

### Milestone 2: Safety And Tool Profiles

Create a `.hepha/safety/` contract:

```text
.hepha/
  safety/
    tool-profiles.yaml
    path-policy.yaml
    command-policy.yaml
```

Agents should receive a named tool profile, not generic shell access. Hepha can
then explain why a run was blocked and what approval is needed.

### Milestone 3: Skills Layer

Add `.hepha/skills/` as portable process assets that can be used by Pi, Codex,
Claude, or another adapter.

Commands remain lifecycle entry points. Skills become reusable procedures inside
those commands.

### Milestone 4: Agent Event Analytics

Extend the existing observability direction with product analytics:

- repeated action detection,
- retry loops,
- long idle states,
- review bottlenecks,
- safety blocks,
- context refreshes,
- user rewrite signals,
- final acceptance outcomes.

The dashboard should answer whether agent work is producing accepted outcomes,
not only whether a model generated text.

### Milestone 5: Handoff Queue Across Agents And Tools

Implement a shared handoff queue:

```text
task created -> context packed -> worker runs -> receipt saved -> next owner selected
```

This is the Hepha version of a multi-tool "open engine." It lets Codex, Pi,
Claude, or a human pick up the same work unit without losing state.

### Milestone 6: Adversarial Review Pattern

Add a reusable adversarial review workflow:

```text
Author Agent -> Critic Agent -> Author Response -> Reviewer Decision
```

Use it for:

- planning artifacts,
- architecture proposals,
- risky migrations,
- release notes,
- public-facing copy,
- high-risk code changes.

The output should be a decision ledger, not an endless debate.

### Milestone 7: Parallel Worktree Execution

Before running many implementation agents at once, Hepha needs:

- branch/worktree allocation,
- per-worktree command serialization,
- ownership locks,
- dirty-state detection,
- merge/rebase status,
- conflict reporting,
- per-FEAT final verification.

This enables parallelism without turning the workspace into shared mutable state.

## Per-Video Notes

### Cole Medin

| Video | Lesson For Hepha |
| --- | --- |
| [The Next Evolution of AI Coding Is Harnesses - Here's How to Build Them](https://www.youtube.com/watch?v=qMnClynCAmM) | A reliable coding workflow needs deterministic nodes, AI nodes, loops, tests, and approval gates. Hepha should keep moving workflow shape into committed YAML and make the runner enforce required gates. |
| [Harness Engineering: What Separates Top Agentic Engineers Right Now](https://www.youtube.com/watch?v=ulNsa0sD8N0) | Harness engineering has two layers: the single-agent session layer and the multi-session orchestration layer. Hepha should own both through commands, skills, context, tools, persistence, observability, and control. |
| [FULL Guide to Becoming a Principled Agentic Engineer](https://www.youtube.com/watch?v=luBkbzjo-TA) | The durable pattern is planning, implementation, validation, then system evolution. Hepha's phase model should preserve those boundaries and make human review explicit at each high-leverage artifact. |
| [Pi Coding Agent + Archon: Build ANY AI Coding Workflow](https://www.youtube.com/watch?v=XSmI7OYd7iM) | Pi can be a strong worker runtime, while Archon-like workflow files provide process shape. Hepha should keep Pi behind a worker adapter and keep workflow authority in Hepha. |
| [Parallel Claude Code + Git Worktrees](https://www.youtube.com/watch?v=rFGlJ4oIlhw) | Parallel agents need isolated branches and worktrees. Hepha should not scale concurrent FEAT implementation until it owns branch/worktree allocation and dirty-state safeguards. |
| [I Built Self-Evolving Claude Code Memory](https://www.youtube.com/watch?v=7huCP6RkcY4) | Memory is useful when it becomes curated, retrievable, and connected to real work. Hepha's LessonsLearned system should promote repeated failures into active rules through review, not by storing every conversation. |
| [Coding Agent Reliability EXPLODES When They Argue](https://www.youtube.com/watch?v=HAkSUBdsd6M) | Adversarial review can improve reliability. Hepha should encode Author -> Critic -> Response -> Reviewer Decision as a reusable workflow pattern. |
| [This One Command Makes Coding Agents Find All Their Mistakes](https://www.youtube.com/watch?v=YeCHI1dmpZY) | Self-review should be a required gate, not an optional prompt. Hepha can add a pre-review mistake-finding step before expensive independent review. |
| [Why the Best AI Coding Tools Abandoned RAG](https://www.youtube.com/watch?v=60G93MXT4DI) | Generic RAG is not a substitute for explicit source reading and curated context. Hepha should prefer deterministic context packs, code search, and file selectors before adding embeddings. |
| [How to Properly Use Claude Code Agent Teams](https://www.youtube.com/watch?v=uvs1Igr4u6g) | Agent teams work when roles are concrete and bounded. Hepha should express team structure as workflow data, not as a free-form group chat. |
| [Turn Claude Code into Your Full Engineering Team with Subagents](https://www.youtube.com/watch?v=-GyX21BL1Nw) | Specialist subagents are useful for bounded functions such as planning, implementation, testing, and review. Hepha should route by work type and tool profile. |
| [Claude Skills Are Not Just for Claude](https://www.youtube.com/watch?v=-iTNOaCmLcw) | Skills are portable process assets. Hepha should add a skills layer that can be injected into Pi, Codex, Claude, or future agents. |
| [My Top 20 Lessons from Building 100s of AI Agents](https://www.youtube.com/watch?v=OFfwN23hR8U) | Agent systems improve through small, concrete, repeated lessons. Hepha should make lessons operational by connecting them to gates, prompts, and context packs. |
| [Why is Everyone Missing This with AI Agents?! Memory + Tools that Scale](https://www.youtube.com/watch?v=F1I9JN0z0w0) | Memory and tools scale better when they are explicit and governed. Hepha should treat memory, tools, and permissions as product contracts. |
| [Context Engineering 101](https://www.youtube.com/watch?v=Mk87sFlUG28) | Better context is usually the highest-leverage improvement. Hepha should show which context was loaded, why it was loaded, and whether it was stale. |
| [The BIG Problem with MCP Servers](https://www.youtube.com/watch?v=1_z3h2r93OY) | Runtime MCP fragility is a real risk. Hepha's existing direction to retire the old DevCycle MCP runtime and move behavior into native workflows is correct. |
| [Pi is INCREDIBLE - Building a Custom Coding Agent Live](https://www.youtube.com/watch?v=lK9o5Wu2upU) | Pi is strongest when adapted to the user's workflow through skills and extensions. For Hepha, skills should carry workflow knowledge and extensions should provide runtime hands, while Hepha remains the state authority. |

### IndyDevDan

| Video | Lesson For Hepha |
| --- | --- |
| [One Agent Is NOT ENOUGH](https://www.youtube.com/watch?v=M30gp1315Y4) | A human repeatedly prompting one agent is acting as the missing orchestrator. Hepha should remove that burden by owning delegation, state, and handoffs. |
| [My Pi Agent Teams. Claude Code Leak SIGNAL. Harness Engineering](https://www.youtube.com/watch?v=RairMJflUSA) | The useful topology is orchestrator -> team leads -> workers. Hepha should keep leads mostly for planning/delegation and workers for bounded execution. |
| [Agent Experts: Finally, Agents That ACTUALLY Learn](https://www.youtube.com/watch?v=zTcDwqopvKE) | Agent expertise should be domain-specific and reusable. Hepha can represent experts as reviewed agent definitions, skills, and active rules. |
| [Claude Code Task System: ANTI-HYPE Agentic Coding](https://www.youtube.com/watch?v=4_2j5wgt_ds) | Durable task state beats hype. Hepha should make task queues, task ledgers, and resumable phase checklists first-class. |
| [One Prompt Every AGENTIC Codebase Should Have](https://www.youtube.com/watch?v=3_mwKbYvbUg) | Every agentic codebase needs a central operating contract. Hepha should verify that each registered project has clear agent instructions, source layout, test commands, safety rules, and definition of done. |
| [Claude Code is Amazing... Until It DELETES Production](https://www.youtube.com/watch?v=VqDs46A8pqE) | Powerful agents need runtime safety, not only good prompts. Hepha should intercept destructive commands and require explicit approval for risky paths and production operations. |
| [The Codebase Singularity](https://www.youtube.com/watch?v=fop_yxV-mPo) | Agents can become highly effective when the codebase is legible and context is current. Hepha should include codebase-readiness checks and architecture maps. |
| [TOP 2% Engineering: /PLAN 2026](https://www.youtube.com/watch?v=u-SQ0Jsv4mI) | Planning is senior engineering work. Hepha should preserve Phase 1 planning and PlanReviewer as quality gates, not optional paperwork. |
| [Why are top engineers DITCHING MCP Servers?](https://www.youtube.com/watch?v=OIKTsVjTVJE) | The useful MCP lessons are tools and protocol boundaries, not runtime dependency on a fragile server. Hepha should migrate capabilities into native commands, skills, and policies. |
| [5 Agent PATTERNS to SIMPLIFY Your Agentic Coding](https://www.youtube.com/watch?v=XojxD7hfaD4) | Hepha should standardize a few patterns: pipeline, supervisor-worker, fan-out review, adversarial review, and repair loop. It should avoid inventing a custom pattern per FEAT. |
| [I Can SEE EVERYTHING: Claude Code Hooks for Multi Agent Observability](https://www.youtube.com/watch?v=9ijnN985O_c) | Multi-agent work needs traces. Hepha should persist event streams with run, card, agent, model, and tool tags. |
| [Yup, Claude Code Plan Mode is here](https://www.youtube.com/watch?v=7LWl3EbcFTc) | Plan mode reinforces the split between thinking and doing. Hepha should separate plan approval from execution and make plan changes visible. |
| [Claude 4 ADVANCED AI Coding: How I PARALLELIZE Claude Code with Git Worktrees](https://www.youtube.com/watch?v=f8RnRuaxee8) | Worktrees are the practical isolation boundary for parallel development. Hepha should pair every autonomous implementation run with a git/worktree session. |
| [Claude Code's Most IMPORTANT FEATURE: Custom Slash Commands](https://www.youtube.com/watch?v=zcHY88VI1oc) | Reusable commands are process leverage. Hepha's `.hepha/commands/` should keep frontmatter, versioning, required gates, and output schemas. |
| [BEST Codebase Architecture for AI Coding and AI Agents](https://www.youtube.com/watch?v=dabeidyv5dg) | Architecture for agents is architecture for maintainability: clear boundaries, small files, discoverable tests, and current docs. Hepha should score projects on agent readiness. |
| [Scale your AI Coding IMPACT with Devin, Cursor, Aider and this ONE Pattern](https://www.youtube.com/watch?v=vq-vTsbSSZ0) | The transferable asset is the workflow pattern, not the tool. Hepha should stay model/tool neutral and route work through the same work-unit contract. |
| [Pi to Pi: Two-Way Agent Orchestration](https://www.youtube.com/watch?v=PIdETjcXNIk) | Agent-to-agent communication may be useful later, but v1 should keep Hepha as the central ledger and scheduler. Peer messages should become recorded handoffs. |
| [Engineers, DELETE the BASH Tool](https://www.youtube.com/watch?v=yBcmIoA-vGs) | Raw shell access should not be the default for long-running agents. Hepha needs command policies, path policies, and tool profiles before high autonomy. |
| [GPT-5.5 VERIFIED Opus 4.7: A Pi Coding Agent That REVIEWS Like YOU](https://www.youtube.com/watch?v=EnXKysJNz_8) | Reviewer agents should encode human preferences and project policy. Hepha should support reviewer profiles and make review rationales auditable. |
| [Pi Coding Agent Observability: HTML Specs](https://www.youtube.com/watch?v=o4KZH_KSqYQ) | Observability artifacts can be user-facing specs, not only debug logs. Hepha should link run traces, generated specs, screenshots, and verification evidence from each FEAT. |

### Nate B Jones

| Video | Lesson For Hepha |
| --- | --- |
| [I Was The Only Thing Connecting Claude, ChatGPT, and Codex. So I Built My Replacement.](https://www.youtube.com/watch?v=QSK4vf_ZTRA) | The human often becomes glue between tools. Hepha should become the shared work queue and receipt system across Pi, Codex, Claude, and human review. |
| [I Stopped Prompting AI One Task At A Time. This Works Better.](https://www.youtube.com/watch?v=A4zMyjkL0Dc) | Agents become useful as loops with memory and stop conditions. Hepha should model recurring loops around work units and stop where Paulo's judgment is needed. |
| [The Doing Got Cheap. Now What?](https://www.youtube.com/watch?v=2w_vwQVvFmc) | The bottleneck moves from doing to deciding, reviewing, and integrating. Hepha should track human attention and review capacity as scarce resources. |
| [You Cannot Run AI Agents Without This](https://www.youtube.com/watch?v=rh_PcL26zls) | Agents need identity, boundaries, and work definition. Hepha should attach project profiles, role identity, tool profiles, and done criteria to every run. |
| [The Skill vs Prompt Problem Everyone Gets Wrong](https://www.youtube.com/watch?v=9PUaEj0pMYE) | A prompt is not a repeatable capability. Hepha should invest in skills as durable procedures with inputs, tools, and expected outputs. |
| [Do Not Build More AI Agents Until You Watch This](https://www.youtube.com/watch?v=BOXK2XFLA-E) | Agent count is not the main constraint. Hepha should improve process, context, and governance before adding more worker types. |
| [Codex: Your First Personal AI Agent Delegation Loop](https://www.youtube.com/watch?v=xqGCbEDbny8) | Delegation is a loop: assign, monitor, inspect, accept, and learn. Hepha should make each of those states explicit in the dashboard. |
| [Stop Picking Between Claude Code and Codex](https://www.youtube.com/watch?v=R2-Y1Hjwx2U) | Tool choice should be a routing decision, not a religious decision. Hepha should route by work type, model strength, context size, safety profile, and cost. |
| [My Codex Ran 800 Million Tokens in A Day](https://www.youtube.com/watch?v=l8BloTSLK6M) | Token volume alone is not the key metric. Hepha should track useful accepted output, review effort, rework, and time-to-acceptance. |
| [A Cursor Agent Wiped a Database in 9 Seconds](https://www.youtube.com/watch?v=n0nC1kmztSk) | Product analytics can reveal agent danger earlier than post-incident logs. Hepha should record approval friction, repeated retries, permission boundaries, and risky tool attempts. |
| [I Built a Deck With AI, Then Made a Second AI Attack It.](https://www.youtube.com/watch?v=MFzxIT88zfg) | Adversarial critique applies beyond code. Hepha can use critic agents for product documents, outreach copy, proposals, and release notes. |
| [Anthropic And OpenAI Just Admitted The Model Is Not Enough.](https://www.youtube.com/watch?v=EpJ0CjTJSag) | Strong models still need environment, tools, memory, permissions, and evaluation. Hepha should make those surrounding layers explicit. |
| [You Are Wasting 40% Of Your AI Time On Something Fixable](https://www.youtube.com/watch?v=647pSnX5H_Y) | Context and handoff friction waste agent time. Hepha should automate context packaging, receipt generation, and state restoration. |
| [The Work Primitive](https://www.youtube.com/watch?v=b1fxYGPbHeo) | Teams need a better unit of work than chat threads. Hepha's work primitive should be the FEAT/phase/task with durable state and acceptance criteria. |
| [LLM Agents: The Security Breach Pattern Nobody's Talking About](https://www.youtube.com/watch?v=SX1myuPEDFg) | Agent security failures often come from tool access and data boundaries. Hepha needs least-privilege tool profiles and secret redaction in traces. |
| [The Real Problem With AI Agents Nobody's Talking About](https://www.youtube.com/watch?v=2PWJu6uAaoU) | General agents fail without personal or project operating context. Hepha should store project profiles, human preferences, working rhythm, and escalation boundaries. |
| [The Missing Orchestration Layer Destroying Teams Right Now](https://www.youtube.com/watch?v=7HP1jFJ9W1c) | Orchestration is the coordination layer between tools, identity, memory, observability, and work. Hepha should focus on coordination instead of trying to own every external capability. |
| [Your Agent Produces at 100x. Your Org Reviews at 3x.](https://www.youtube.com/watch?v=kVPVmz0qJvY) | Review throughput becomes the bottleneck. Hepha should optimize review scope, batch findings, and track review latency. |
| [Your Agent Is Missing 12 Critical Pieces](https://www.youtube.com/watch?v=FtCdYhspm7w) | Agents need a complete capability stack. Hepha should turn this idea into a project readiness checklist: context, tools, permissions, memory, identity, observability, review, and recovery. |
| [Anthropic, OpenAI, and Microsoft Just Agreed on One File Format](https://www.youtube.com/watch?v=0cVuMHaYEHE) | Portable instruction/work formats matter for interoperability. Hepha should keep important process contracts in versioned files instead of hiding them in one vendor's UI. |

## Decisions For Hepha

1. Keep Hepha local-first and workflow-owned. Do not make runtime MCP the center.
2. Treat Pi, Codex, Claude, and future tools as interchangeable worker adapters.
3. Add run receipts before broad multi-agent handoffs.
4. Add safety/tool profiles before increasing autonomous shell use.
5. Add a skills layer as a portable process abstraction.
6. Expand observability into product analytics for agent work.
7. Make review throughput and recovery loops visible dashboard metrics.
8. Use LessonsLearned as reviewed active rules, not unbounded agent memory.
9. Build toward worktree-isolated parallel FEAT execution.
10. Prefer fewer, better-governed agent roles over uncontrolled agent sprawl.
