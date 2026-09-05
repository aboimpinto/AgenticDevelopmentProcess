---
name: submit-epic
description: >-
  Use when the user asks Pi to submit, create, or draft a new HEPHA EPIC
  directly from a registered project workspace, preserving the useful legacy
  DevCycle MCP submit-epic command, for example "submit-epic for HEPHA build
  observability projection hooks" or "create a HEPHA EPIC titled Runtime
  Approval Gates".
agent_action: submit-epic
---

# Submit Epic

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `submit-epic` workflow directly from Pi.

This skill adapts the useful contract from the legacy DevCycle MCP
`submit-epic` command to HEPHA's current portable MemoryBank workflow.

## Persona

Act as a Strategic Product Architect: vision-oriented, thorough, practical, and
alignment-focused. Think in terms of business outcomes, user value,
dependencies, strategic sequencing, and implementation posture.

## Objective

Create a new EPIC folder under `MemoryBank/Features/00_EPICS/` with a complete
`EpicDescription.md`, assign the next `EPIC-XXX` id, update
`NEXT_EPIC_ID.txt`, and report the created location and recommended next steps.

## Required Inputs

Accept these from the user's message:

- EPIC description or initiative idea; required;
- optional title;
- optional external reference or issue id;
- optional owner;
- optional priority: `Critical`, `High`, `Medium`, or `Low`;
- optional project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- optional MemoryBank path override.

If the EPIC description is missing, ask one concise question. Otherwise infer
safely. If no project is named, default to HEPHA / AgenticDevelopmentProcess
when the workspace contains that child project or the current directory is
inside it.

## Workspace And Project Resolution

1. Treat the current directory as the workspace starting point.
2. Resolve the active project named by the user and locate its repository root.
3. Read the project `AGENTS.md` and project brief or MemoryBank overview when
   present before editing.
4. Resolve the active project:
   - `HEPHA`, `Hepha`, and `AgenticDevelopmentProcess` map to
     `<workspace root>/AgenticDevelopmentProcess`.
   - If the user names another project, use `docs/projects.md` or the nearest
     child repo folder matching that name.
5. Read the child project `AGENTS.md` and `README.md` when present.
6. Run project git and file commands from the child project root, not from the
   parent workspace.

## MemoryBank Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

If no MemoryBank can be resolved, ask the user for the MemoryBank path. Do not
create a new MemoryBank unless the user explicitly requests initialization.

## Required Context Reads

Before creating the EPIC, read enough context to avoid duplicates and align the
new EPIC:

- project `README.md` when present;
- `MemoryBank/Overview/` when present;
- `MemoryBank/Architecture/` when present;
- existing `MemoryBank/Features/00_EPICS/*/EpicDescription.md` files;
- existing FEAT folders under `MemoryBank/Features/01_SUBMITTED`,
  `02_READY_TO_DEVELOP`, `03_IN_PROGRESS`, `04_COMPLETED`, and `05_CANCELLED`
  when useful for duplicate detection and relationship hints.

If these folders are empty or missing, note that this appears to be an
early-stage project and continue.

## Duplicate And Scope Check

Before assigning the id:

1. Compare the requested initiative against existing EPIC titles, summaries,
   problem statements, and feature breakdowns.
2. If an existing EPIC clearly covers the same scope, stop and report the
   likely duplicate path instead of creating a new EPIC.
3. If the scope overlaps but is distinct, create the EPIC and include the
   relationship or boundary in `Out of Scope`, `Risks and Mitigations`, or
   `Next Steps`.
4. If the description is vague but still points to a strategic initiative,
   generate the EPIC anyway and add a note that Deep-Dive should clarify the
   unknowns.

## ID And Folder Creation

1. Ensure `MemoryBank/Features/00_EPICS/` exists.
2. Read or create `MemoryBank/Features/00_EPICS/NEXT_EPIC_ID.txt`:
   - if missing, create it with `1` and use `1`;
   - if present, read the integer and use it;
   - after successful EPIC creation, increment and write the next integer.
3. Format the id as `EPIC-XXX`, zero-padded, for example `EPIC-011`.
4. Generate the title:
   - use the user-supplied title when provided;
   - otherwise generate a 3-8 word strategic, outcome-oriented title;
   - avoid punctuation and special characters in the title.
5. Generate the folder slug:
   - lowercase;
   - hyphen-separated;
   - no special characters;
   - max about 50 characters;
   - format: `EPIC-XXX-slug`.
6. If the target folder already exists, stop and report the conflict. Do not
   overwrite.

## EpicDescription.md Required Structure

Create `EpicDescription.md` in the new folder with this structure, adapted to
project context and the user's description:

````markdown
# EPIC-XXX: {Title}

| Field | Value |
|-------|-------|
| Epic ID | EPIC-XXX |
| State | NotStarted |
| Created | {YYYY-MM-DD} |
| Target Completion | TBD - define during planning |
| Owner | {owner or TBD} |
| Priority | {Critical / High / Medium / Low} |
| External Reference | {external reference or N/A} |

## Executive Summary

{What are we building? Why? Who benefits?}

## Problem Statement

{Current pain points, impact of not solving, missed opportunities.}

## Success Criteria

- [ ] {Measurable outcome 1}
- [ ] {Measurable outcome 2}
- [ ] {Measurable outcome 3}

## Implementation Posture

State whether this EPIC is expected to be:

- audit-only;
- audit-and-hardening; or
- formal new implementation for missing behavior.

If the answer is uncertain, say what Deep-Dive must clarify. For Hepha platform
work, do not label an EPIC as audit-only when the requested behavior is known to
be missing or visibly broken.

## Features Breakdown

| Feature ID | Title | Status | Dependencies | Priority |
|------------|-------|--------|--------------|----------|
| TBD | {Suggested feature 1} | SUBMITTED | None | P1 |
| TBD | {Suggested feature 2} | SUBMITTED | {Feature 1 or TBD} | P1 |
| TBD | {Suggested feature 3} | SUBMITTED | {TBD} | P2 |

> Feature IDs are assigned when created via the future `create-epic-features`
> or `submit-feature` workflow.

## Epic Progress

**State:** NotStarted
**Progress:** 0% (0/{N} features complete)

| Status | Count | Features |
|--------|-------|----------|
| Completed | 0 | - |
| In Progress | 0 | - |
| Ready | 0 | - |
| Submitted | {N} | TBD |

## Dependency Flow Diagram

```mermaid
flowchart TD
    subgraph "EPIC-XXX: {Title}"
        direction TB
        F1[{Feature 1}]
        F2[{Feature 2}]
        F3[{Feature 3}]

        F1 --> F2
        F1 --> F3
    end

    classDef notStarted fill:#6c757d,color:white,stroke:#495057
    classDef designed fill:#6c757d,color:white,stroke:#17a2b8
    classDef ready fill:#6c757d,color:white,stroke:#28a745
    classDef inProgress fill:#ffc107,color:black,stroke:#e0a800
    classDef completed fill:#28a745,color:white,stroke:#1e7e34
    classDef cancelled fill:#dc3545,color:white,stroke:#c82333

    class F1,F2,F3 notStarted
```

## Feature Details

### Feature 1: {Title}

**User Story:** As a {user}, I want {capability} so that {benefit}.

**Scope:**
- {scope item}

**Dependencies:** None

### Feature 2: {Title}

**User Story:** As a {user}, I want {capability} so that {benefit}.

**Scope:**
- {scope item}

**Dependencies:** Feature 1

### Feature 3: {Title}

**User Story:** As a {user}, I want {capability} so that {benefit}.

**Scope:**
- {scope item}

**Dependencies:** Feature 1

## Out of Scope

- {Explicit boundary}

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| {risk} | H/M/L | H/M/L | {strategy} |

## Progress Tracking

| Feature ID | Status | Started | Completed | Notes |
|------------|--------|---------|-----------|-------|
| TBD | SUBMITTED | - | - | {Feature 1} |
| TBD | SUBMITTED | - | - | {Feature 2} |
| TBD | SUBMITTED | - | - | {Feature 3} |

**Overall Progress:** 0/{N} features complete (0%)

## Next Steps

1. Run `deep-dive` to validate assumptions and answer open questions.
2. Extract or create child FEATs from the Features Breakdown.
3. Refine the first child FEAT before implementation.
````

## Content Rules

- Use practical product language, not hype.
- Keep feature suggestions discrete and deliverable.
- Prefer 3-7 child feature suggestions unless the user explicitly asks for a
  smaller/larger EPIC.
- Include dependencies that make sequencing clear.
- Include an Implementation Posture section so future Deep-Dive/refinement does
  not mistake formal new implementation for a simple audit.
- Mark uncertain details as assumptions or Deep-Dive questions, not as facts.
- Do not create child FEAT folders in this skill. This skill creates only the
  EPIC and updates the EPIC counter.
- Do not move board state directly beyond creating the new EPIC under
  `00_EPICS`.
- Do not edit unrelated EPICs or FEATs unless needed to prevent a duplicate and
  the user explicitly approves.

## Completion Checklist

This skill is done when:

- workspace and project context were read;
- MemoryBank path was resolved;
- existing EPICs were checked for duplicates;
- `NEXT_EPIC_ID.txt` was read/created and incremented after successful creation;
- EPIC folder was created under `MemoryBank/Features/00_EPICS/`;
- `EpicDescription.md` was written with the required structure;
- a concise submission summary was presented.

## Confirmation Response

After creation, respond with:

```markdown
Epic Submitted Successfully

- Epic ID: EPIC-XXX
- Title: {title}
- Location: {MemoryBank}/Features/00_EPICS/{folder}/

Next Steps:
1. Run `deep-dive` for EPIC-XXX.
2. Create child FEATs from the Features Breakdown.
3. Refine the first child FEAT before implementation.
```

## Error Recovery

| Scenario | Action |
|----------|--------|
| Folder already exists | Report conflict and do not overwrite. |
| Counter is invalid | Inspect existing EPIC folders, choose max existing id + 1, then rewrite `NEXT_EPIC_ID.txt` after creation. |
| Cannot write files | Report the failing path and step. |
| Existing EPIC appears duplicate | Stop and report duplicate candidate path. |
| Description is vague | Generate the EPIC with explicit assumptions and Next Steps requiring Deep-Dive. |
