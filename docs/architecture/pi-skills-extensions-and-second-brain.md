# Pi Skills, Extensions, And The Hepha Second Brain

## Purpose

Hepha should use Pi's skill and extension model as a native worker surface,
while keeping Hepha's own orchestrator as the source of truth for workflow
state, safety policy, run receipts, and cross-project knowledge selection.

The goal is to let Hepha "sit on the shoulders of giants": every completed
project should leave reusable knowledge that improves the next project without
copying private client details, stale logs, or one-off mistakes into future
prompts.

## Sources

- Pi skills docs: <https://pi.dev/docs/latest/skills>
- Pi extensions docs: <https://pi.dev/docs/latest/extensions>
- Pi package security docs: <https://pi.dev/docs/latest/packages>
- Pi SDK docs: <https://pi.dev/docs/latest/sdk>
- Cole Medin video: [Pi is INCREDIBLE - Building a Custom Coding Agent Live](https://www.youtube.com/watch?v=lK9o5Wu2upU)
- Existing package watchlist: [Pi Package Catalog Watchlist](../research/pi-package-catalog-watchlist.md)
- Existing LessonsLearned workflow: [LessonsLearned Curator Prompts](../prompts/lessons-learned-curator.md)

## Core Decision

Use Pi skills and extensions as Hepha worker capabilities, not as a replacement
for the Hepha orchestrator.

The useful split is:

```text
Skill = knowledge and procedure.
Extension = hands and runtime integration.
Hepha orchestrator = state, policy, routing, receipts, and acceptance.
Second brain = durable cross-project learning.
```

This matches the direction in the Archon/Pi video: Archon no longer needs to be
an MCP runtime for the agent to benefit from Archon-like process knowledge. The
process can be shipped as skills and extensions, while the product still owns
the higher-level workflow.

## What Belongs In A Pi Skill

Pi skills are best for repeatable work instructions that should follow the
agent across projects or worker adapters.

Good Hepha skill candidates:

- `hepha-deep-dive.skill.md`
- `hepha-design-feature.skill.md`
- `hepha-refine-feature.skill.md`
- `hepha-implement-phase.skill.md`
- `hepha-review-phase.skill.md`
- `hepha-repair-review-findings.skill.md`
- `hepha-complete-feature.skill.md`
- `hepha-lessons-curator.skill.md`
- `hepha-second-brain-import.skill.md`

Each skill should define:

- purpose,
- required inputs,
- required reads,
- allowed writes,
- expected artifacts,
- output schema,
- stop conditions,
- evidence requirements,
- safety profile.

Skills should not decide workflow state. A skill may produce a recommendation
such as "phase ready for review" or "blocked by missing acceptance criteria."
Hepha records the recommendation, validates it, and moves state only if the
workflow gates pass.

## What Belongs In A Pi Extension

Pi extensions are TypeScript runtime code. They can register tools, intercept
events, add commands, display UI, and integrate with external systems. That
makes them powerful and risky.

Good Hepha extension candidates:

- `hepha_get_context_pack`: ask Hepha for the exact context bundle selected for
  a run.
- `hepha_emit_event`: send normalized Pi events into the Hepha run trace.
- `hepha_record_receipt`: submit the run receipt shape declared by the workflow.
- `hepha_ask_user_question`: route a structured agent question to the Hepha
  dashboard instead of trapping it inside the terminal.
- `hepha_safe_command`: execute approved project commands through Hepha's
  command policy instead of raw shell habits.
- `hepha_lookup_knowledge`: retrieve selected second-brain rules or patterns by
  tags and applicability.
- `hepha_status_line`: show active project, FEAT, phase, model, and tool profile
  inside Pi.

Extensions should not:

- move cards directly,
- write the orchestrator SQLite database directly,
- bypass safety policy,
- push or release without explicit Hepha approval,
- silently import private second-brain notes into prompts,
- create new long-term memory without a promotion workflow.

If an extension needs to change state, it should call a Hepha API that applies
the same validation as the dashboard.

## What Must Stay In The Hepha Orchestrator

Hepha owns:

- project registration,
- MemoryBank path resolution,
- EPIC/FEAT/phase/task state,
- workflow node execution,
- model routing,
- context pack selection,
- safety profile selection,
- worktree and branch ownership,
- command serialization,
- review gate enforcement,
- user approval gates,
- run receipts,
- trace persistence,
- cross-project knowledge selection,
- LessonsLearned promotion,
- final acceptance.

The Pi worker can be smart. It should not become the state machine.

## Why Not Put Everything In Pi

Pi is intentionally minimal and extensible. That is an advantage for Hepha, but
it also means installed packages can become hidden runtime authority if we are
not careful.

Risks of moving too much into Pi:

- a skill silently changes the process without a workflow diff,
- an extension has broader filesystem or shell access than the FEAT requires,
- state is split between Pi session history and Hepha SQLite,
- useful lessons become trapped in one terminal profile,
- client-specific context leaks into a global agent memory,
- the dashboard cannot explain why a FEAT moved or blocked.

The right model is composition:

```text
Hepha chooses the work.
Hepha chooses the context.
Hepha chooses the safety profile.
Pi executes the selected skill with selected extensions.
Pi returns events, artifacts, questions, findings, and receipts.
Hepha validates and moves the workflow.
```

## The Second Brain

Hepha needs a cross-project knowledge layer that is separate from any one
project MemoryBank.

Project MemoryBanks answer:

```text
What is true for this project?
```

The second brain answers:

```text
What have we learned across projects that should improve the next project?
```

The second brain should be Obsidian-compatible Markdown so Paulo can browse,
edit, link, and curate it outside Hepha. Hepha should treat it as a configured
vault path, not as a hardcoded repository location.

Suggested configuration:

```text
HEPHA_KNOWLEDGE_VAULT_PATH=<path to Obsidian-compatible vault>
```

Suggested default when no explicit vault is configured:

```text
<workspace root>/KnowledgeBank
```

## Second Brain Structure

Target structure:

```text
KnowledgeBank/
  README.md
  Inbox/
    raw-candidates/
  Lessons/
    Active/
      index.md
      common.md
      evidence-hygiene.md
      code-review-recovery.md
      command-discipline.md
      frontend-quality.md
      client-privacy.md
      rust-cargo.md
      typescript-nextjs.md
    Archive/
  Patterns/
    agentic-development/
    project-delivery/
    web-builds/
    research/
  Skills/
    candidates/
    active/
  Sources/
    videos/
    docs/
    books/
  ProjectProfiles/
    index.md
```

The vault is not a transcript dump and not a secret store. It is a curated set
of reusable patterns, rules, checklists, and source pointers.

## Knowledge Note Format

Use YAML frontmatter so Hepha can select notes deterministically.

```markdown
---
id: hepha-rule-accurate-test-evidence
type: active-rule
scope: cross-project
status: active
privacy: sanitized
applies_to:
  - implementation
  - code-review
  - completion
stacks:
  - rust
  - typescript
tools:
  - cargo
  - pnpm
triggers:
  - test evidence is documented
  - phase status is updated
source_projects:
  - CodeWhale
source_refs:
  - FEAT-004 Phase 2 review recovery
confidence: proven
last_reviewed: 2026-06-28
---

# Accurate Test Evidence

Instead of copying old counts or broad-filter totals, run the exact command,
record the observed result, and distinguish unique tests from repeated
verification runs.

Verify by checking the command transcript, touched documents, and tracked
artifacts before marking a phase complete.
```

Required fields:

- `id`
- `type`
- `scope`
- `status`
- `privacy`
- `applies_to`
- `triggers`
- `confidence`

Useful optional fields:

- `stacks`
- `tools`
- `project_types`
- `source_projects`
- `source_refs`
- `supersedes`
- `related`

## Promotion Pipeline

Knowledge should move through gates:

```text
Completed FEAT
  -> raw project LessonsLearned
  -> project active rules
  -> global candidate note
  -> privacy/sanitization review
  -> active second-brain rule or pattern
  -> selected into future context packs
  -> measured by future run receipts
```

### Step 1: Raw Project Lesson

Each completed FEAT writes:

```text
<Project MemoryBank>/LessonsLearned/<feat-id>-lessons-learned.md
```

This file may contain project-specific detail because it lives with that
project's MemoryBank.

### Step 2: Project Active Rule

The existing LessonsLearned curator promotes reusable rules into:

```text
<Project MemoryBank>/LessonsLearned/Active/
```

These rules constrain future work inside the same project.

### Step 3: Global Candidate

A second-brain curator reads project active rules and completed FEAT lessons,
then proposes sanitized cross-project candidates under:

```text
KnowledgeBank/Inbox/raw-candidates/
```

The candidate should remove private client material, credentials, exact local
paths, screenshots, and sensitive business details unless the user explicitly
allows them.

### Step 4: Global Active Rule Or Pattern

After review, the candidate moves to:

```text
KnowledgeBank/Lessons/Active/
```

or:

```text
KnowledgeBank/Patterns/
```

Active rules are short operational constraints. Patterns are longer reusable
approaches, such as "how to structure a local-first dashboard agent workflow."

### Step 5: Future Context Selection

When a new project or FEAT starts, Hepha selects second-brain notes by:

- agent role,
- workflow command,
- project type,
- stack,
- tools,
- phase,
- risk level,
- current task vocabulary,
- explicit user-selected knowledge packs.

Hepha should inject active cross-project rules before raw project history. It
should never dump the whole vault into a prompt.

## Privacy Policy

Default rule:

```text
Project MemoryBank can contain project-specific history.
Second brain contains sanitized reusable knowledge.
```

Do not promote:

- credentials,
- private client source material,
- private business contacts,
- sensitive screenshots,
- personal information,
- minor-related public-facing details beyond approved privacy-safe guidance,
- exact local machine paths unless they are generic and portable,
- proprietary code snippets unless explicitly approved.

If a lesson depends on private context, promote only the abstract rule and keep
the source detail inside the project MemoryBank.

## Cross-Project Knowledge Import

Each project registration should eventually include:

```yaml
knowledge_imports:
  enabled: true
  include_tags:
    - active-rule
    - frontend-quality
    - evidence-hygiene
  exclude_tags:
    - client-specific
    - private
  max_rules: 12
  max_patterns: 3
```

Hepha records which global notes were selected in the run receipt. If a selected
rule was not useful or caused friction, the review/complete-feature workflow can
mark it as noisy. Repeated noisy selections should trigger deprecation or
retagging.

## Cross-Project Knowledge Export

Each project can also define export policy:

```yaml
knowledge_exports:
  enabled: true
  require_human_review: true
  allowed_types:
    - active-rule
    - pattern
    - checklist
  privacy_level: sanitized
```

Private client projects should default to human review before any cross-project
promotion.

## Relationship To Skills

The second brain stores knowledge. Skills operationalize knowledge.

Example:

```text
KnowledgeBank/Lessons/Active/evidence-hygiene.md
  -> informs
.hepha/skills/review-phase.skill.md
  -> injected into
Pi Review Agent run
  -> emits
run receipt with selected knowledge ids
```

Hepha should be able to generate or update candidate skills from stable active
rules, but skills should still be reviewed before becoming active.

## Relationship To Extensions

Extensions can make the second brain usable inside Pi:

- search active rules by tag,
- show selected rule ids in the Pi status line,
- emit which knowledge notes influenced a run,
- request a missing pattern from Hepha,
- submit a candidate lesson after a repeated failure.

Extensions should not silently write active second-brain rules. Writes should go
through the promotion pipeline.

## Implementation Roadmap

### Milestone 1: Document The Boundary

- Keep this architecture document current.
- Update the harness contract to reference skills, extensions, and second-brain
  selection.
- Keep the package watchlist as evaluation input, not runtime authority.

### Milestone 2: Add Global Knowledge Configuration

- Add `HEPHA_KNOWLEDGE_VAULT_PATH`.
- Add optional project-level knowledge import/export settings.
- Add a read-only scanner for Obsidian-compatible Markdown frontmatter.

### Milestone 3: Add Global Knowledge Curator

- Extend the LessonsLearned curator with a cross-project candidate workflow.
- Write sanitized candidates to `KnowledgeBank/Inbox/raw-candidates/`.
- Require human review before active promotion.

### Milestone 4: Add Context Selection

- Select global active rules by command, agent, stack, tools, and phase.
- Record selected note ids in the run receipt.
- Show selected global knowledge in the dashboard run detail.

### Milestone 5: Create Hepha Pi Companion Package

Build a small package only after the orchestrator API and safety contracts are
stable.

First package contents:

```text
skills/
  hepha-review-phase.skill.md
  hepha-repair-review-findings.skill.md
extensions/
  hepha-emit-event.ts
  hepha-record-receipt.ts
  hepha-status-line.ts
```

Do not start by packaging the entire workflow. Start with observability and
receipts, because those make every future worker safer.

### Milestone 6: Generate Skills From Stable Rules

When a rule has been proven across multiple FEATs or projects, propose updates
to the relevant skill. The proposal should include:

- rule id,
- source projects,
- failure pattern,
- skill section to update,
- expected behavior change,
- verification gate.

No self-modifying skill activation without review.

## Non-Goals

- Do not replace Hepha with Pi packages.
- Do not replace project MemoryBanks with one global vault.
- Do not import an entire Obsidian vault into every prompt.
- Do not store private client material in global memory by default.
- Do not let skills or extensions bypass Hepha gates.
- Do not make long-term memory depend on one vendor's agent history format.
