# Hepha Inspiration: Harnesses, Agent Teams, And Self-Learning

## Purpose

This document records the external and internal projects that shape Hepha's
target implementation. It is not a product comparison and it is not a plan to
copy another project. The goal is to make explicit which ideas Hepha should
reuse, which ideas it should adapt, and which ideas it should avoid.

Hepha is the local-first agentic development harness for Paulo Aboim Pinto's
development process. Its product workflow is:

```text
EPIC -> FEAT -> Phase -> Task -> Implementation -> Review -> LessonsLearned
```

The central design choice is that Hepha must make the early product and
planning steps detailed enough that the implementation worker can execute with
few or no questions. Expensive reasoning models are used while ambiguity is
high. Fast, cheaper implementation models are used only after the work has been
made concrete.

## Sources

Primary references:

- Archon repository: <https://github.com/coleam00/Archon>
- Archon product site: <https://archon.diy/>
- Cole Medin video: "The Next Evolution of AI Coding Is Harnesses - Here's How
  to Build Them" - <https://www.youtube.com/watch?v=qMnClynCAmM>
- Cole Medin channel: <https://www.youtube.com/@ColeMedin>
- IndyDevDan channel: <https://www.youtube.com/@indydevdan>
- IndyDevDan video: "One Agent Is NOT ENOUGH: Agentic Coding BEYOND Claude
  Code" - <https://www.youtube.com/watch?v=M30gp1315Y4>
- IndyDevDan video: "My Pi Agent Teams. Claude Code Leak SIGNAL. Harness
  Engineering" - <https://www.youtube.com/watch?v=RairMJflUSA>
- IndyDevDan video: "Agent Experts: Finally, Agents That ACTUALLY Learn" -
  <https://www.youtube.com/watch?v=zTcDwqopvKE>
- Ornith video: "Introducing Ornith 1.0 - Agentic Coding LLMs" -
  <https://www.youtube.com/watch?v=uD4-uy0GmHE>
- Local DevCycle MCP source: `~/myWork/DevelopmentProcess`

## Hepha's Own Starting Point

The most important source is the previous DevCycle MCP. It already proved that
Paulo's development process can run reliably when the agent receives a strict
procedure instead of an open-ended request.

The old MCP worked because it had several strong properties:

- Commands returned detailed execution recipes instead of vague tool calls.
- The caller LLM performed local file, git, build, and test work.
- MemoryBank folder transitions gave the process durable state.
- Each lifecycle command had a clear purpose and expected artifact set.
- Autonomous implementation explicitly chained `continue-implementation`,
  `accept-phase`, and `complete-feature` unless a real blocker appeared.
- Code review was not an end state. It was a recovery input that should trigger
  fixes, another review, and continuation.

Hepha should preserve that reliability. The migration away from MCP should not
mean moving from deterministic procedures to a weaker "ask an agent and hope"
model.

## Archon: Workflow Harness Discipline

Archon is the clearest reference for the harness layer. Its README describes it
as a workflow engine for AI coding agents where development processes are
defined as YAML workflows. The critical lesson is that the process owner
controls the structure, while the AI supplies intelligence only inside selected
nodes.

Ideas to reuse:

- Development workflows are committed files, not hidden application state.
- YAML owns workflow shape: nodes, dependencies, loops, gates, and status.
- Long prompts live in reusable command templates, not only in code.
- Deterministic nodes and AI nodes are different concepts.
- Deterministic nodes should own validation, test commands, git checks,
  context collection, and state transitions.
- AI nodes should own interpretation, planning, code generation, review, and
  synthesis.
- The runner should support fresh context between major phases.
- Human approval gates should be explicit workflow nodes.
- Workflow execution needs durable logs visible in the UI.
- A workflow can run from CLI, UI, GitHub, or another trigger because the
  workflow definition is independent from the trigger.

Ideas to adapt:

- Archon's generic "idea to PR" and "fix issue" flows are useful patterns, but
  Hepha's core flow is not generic issue fixing. Hepha's core flow is Paulo's
  drill-down process from EPIC to task-level implementation.
- Archon can run broad software development workflows. Hepha should be narrower
  and more opinionated so it can be more reliable inside this process.
- Archon command templates are reusable prompt assets. Hepha should use the
  same principle, but include MemoryBank paths, EPIC/FEAT relationships,
  LessonsLearned injection, phase gates, and project-specific policy.

Ideas to avoid:

- Do not make the first milestone a generic workflow builder.
- Do not treat the web UI as the harness. The UI visualizes and triggers the
  harness; it is not where reliability comes from.
- Do not let agents choose whether to run required tests, reviews, or status
  transitions.

## Cole Medin: Harness Engineering

Cole Medin's harness framing is useful because it names the missing layer
between a single coding agent and a repeatable development process.

The useful progression is:

```text
Prompt engineering -> Context engineering -> Harness engineering
```

For Hepha, this means:

- Prompt engineering is not enough. A good `refine-feature` prompt cannot make
  the whole system reliable by itself.
- Context engineering is necessary but still incomplete. We must curate the
  right EPIC, FEAT, design, phase, project policy, and LessonsLearned context.
- Harness engineering is the actual target. Hepha must orchestrate multiple
  agent sessions, deterministic checks, recovery loops, gates, and model
  choices.

Hepha's harness must answer these questions for every node:

- Which model should run this step?
- Which agent role owns it?
- Which context pack is allowed?
- Which files or artifacts must exist afterward?
- Which gate decides whether the process can continue?
- What happens if the agent stops, fails, or produces partial output?
- What can be retried automatically, and what requires the user?

## IndyDevDan: Agent Teams And Specialist Memory

IndyDevDan's agent-team material is relevant because Hepha should not treat all
agent work as one generic assistant session.

The useful pattern is a three-level team:

```text
Orchestrator -> Team Leads -> Workers
```

For Hepha, this maps to:

```text
Hepha Orchestrator
  Requirements Lead
    EPIC Deep-Dive Worker
    FEAT Deep-Dive Worker
    Feature Extraction Worker
  Design Lead
    UX/Wireframe Worker
  Refinement Lead
    Phase Planner Worker
    Acceptance Criteria Worker
    Test Plan Worker
  Implementation Lead
    Stack-Specific Developer Worker
    Test Worker
  Review Lead
    Plan Reviewer
    Code Reviewer
    Security/Regression Reviewer
  Lessons Lead
    Raw Lesson Extractor
    Active Rule Curator
```

The important constraint is that not every agent should have every tool. Leads
should mostly think, coordinate, and delegate. Workers should operate inside a
bounded domain with a clear tool set.

Ideas to reuse:

- The user talks to one orchestrator, not to every worker.
- Specialist agents have narrow purpose, model policy, tools, and domain
  boundaries.
- Teams can be configured as data rather than hardcoded.
- Multiple reviewers can inspect the same output from different perspectives.
- Agents should accumulate domain expertise over time, but source files and
  MemoryBank remain the source of truth.
- The most capable model should coordinate and review; cheaper models can do
  bounded worker tasks.

Ideas to adapt:

- Hepha should not start with free-form chat between agents. The orchestrator
  remains the scheduler and state authority.
- Hepha should use specialist teams for known workflow steps, not for general
  discussion.
- Persistent agent memory should become LessonsLearned active rules and
  bounded expertise files, not unbounded conversation history.

Ideas to avoid:

- Do not let agent-to-agent communication directly move Kanban state.
- Do not let a lead silently perform worker writes unless the workflow records
  that fallback and validates the output.
- Do not use persistent memory as a replacement for source-of-truth files.

## Ornith: Self-Scaffolding And Learnable Harnesses

The Ornith video is relevant because it points toward systems that can improve
their own scaffolding instead of only executing tasks. Hepha should not try to
start as a self-modifying coding model, but it should treat its harness assets
as improvable project artifacts.

Hepha should apply this idea in a controlled way:

- Workflows, prompt templates, agent definitions, context packs, and active
  LessonsLearned rules are versioned files.
- Review failures and repeated recovery patterns should create improvement
  candidates.
- A LessonsLearned curator can promote repeated mistakes into active rules.
- A future harness-curator workflow can propose changes to `.hepha` templates,
  but those changes must be reviewed before becoming active.

This gives Hepha self-learning without allowing the system to rewrite its own
process silently.

## The Hepha Difference

Hepha is inspired by these projects, but it is not the same thing.

The differentiator is the drill-down process:

```text
EPIC
  clarify until ambiguity is explicit
  answer questions
  extract FEATs

FEAT
  clarify again
  design/wireframe if UI is involved
  refine into phases
  define interfaces, files, tests, acceptance criteria

Phase
  execute bounded work
  review against the phase plan
  fix required findings
  record evidence

Task
  small enough for a fast implementation model
  detailed enough to avoid architectural guessing
```

The system is intentionally asymmetric:

- Early ambiguity uses expensive high-thinking models.
- Implementation uses a cheaper fast model only after ambiguity has been
  removed.
- Review uses high-thinking models again where judgment matters.
- State transitions use deterministic orchestrator code.

## Implementation Consequences

Hepha should implement these concrete contracts:

- `.hepha/workflows/*.workflow.yaml` for future workflow source of truth.
- `.workflows/*.workflow.yaml` remains supported during migration.
- `.hepha/commands/*.md` for prompt templates with frontmatter.
- `.hepha/agents/*.agent.yaml` for agent roles, models, tools, and domains.
- `.hepha/context/*.context.yaml` for deterministic context packs.
- `.hepha/schemas/*.schema.json` for structured outputs.
- `.hepha/lessons/` for active rule injection policy and raw-to-active
  promotion templates.
- SQLite for run state, logs, recovery checkpoints, and UI status.
- MemoryBank for durable product and implementation artifacts.

Every workflow prompt node should eventually declare:

```yaml
prompt: refine-feature
command: commands/refine-feature.md
agent: feature-refiner
context: context/feature-refinement.context.yaml
output_schema: schemas/refined-feature-output.schema.json
required_artifacts:
  - FeatureTasks.md
  - phases/*.md
gates:
  - no-open-questions
  - acceptance-criteria-present
  - phase-tasks-actionable
```

The orchestrator should reject a workflow if any referenced command, agent,
context pack, schema, or required static policy file is missing.

## First Implementation Slice

The first slice should not rebuild the whole runtime. It should create the
guardrails that prevent the same ambiguity from reappearing.

Implement first:

1. Add the `.hepha` contract documentation and directory structure.
2. Add command templates for current prompt nodes.
3. Add a `command:` reference to each current YAML prompt node.
4. Validate that referenced command templates exist.
5. Keep the existing TypeScript prompt builders temporarily.
6. Convert one runtime prompt at a time from TypeScript to template rendering.

The first prompt to convert should be `refine-feature`, because it is the
handoff between high-thinking planning and cheaper implementation.

## Design Rule

When in doubt, preserve this rule:

```text
Agents may produce work, but Hepha owns the process.
```

That means Hepha owns workflow state, model routing, safety, validation,
recovery, board transitions, and LessonsLearned promotion. Agent sessions are
replaceable workers inside that harness.
