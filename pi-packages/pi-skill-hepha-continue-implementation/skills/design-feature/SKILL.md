---
name: design-feature
description: Use when the user asks Pi to run design-feature, design a HEPHA FEAT, create UI requirements, or prepare UX/design artifacts for a FEAT, for example "design-feature FEAT-004" or "Use the design-feature skill for HEPHA FEAT-004".
agent_action: design-feature
---

# Design Feature

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `design-feature` workflow directly from Pi.

This skill creates UI/UX design artifacts for a clarified FEAT that HEPHA has
classified as requiring UI work. It must work when Pi is opened from a
registered project or parent workspace and the user names the active project
plus a FEAT id such as `FEAT-004`.

## Required Inputs

Accept these from the user's message:

- FEAT id, such as `FEAT-004`;
- optional project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- optional MemoryBank path override.

If the FEAT id is missing, ask one concise question. Otherwise, infer safely.
If no project is named, default to HEPHA / AgenticDevelopmentProcess when the
workspace contains that child project or the current directory is inside it.

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
6. Run project git, validation, and edit commands from the child project root,
   not from the parent workspace.

## MemoryBank And FEAT Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

Then resolve the FEAT:

1. Normalize the requested FEAT id to uppercase, for example `FEAT-004`.
2. Search all workflow folders under `<MemoryBank>/Features`.
3. Match a FEAT folder by folder name or by `FeatureDescription.md` content.
4. Require a readable `FeatureDescription.md`.
5. Stop if the FEAT contains `[NEEDS VALIDATION]`; report exact file and line
   references.
6. Stop if design artifacts already exist, unless the user explicitly asks to
   update them.

## Required Context Reads

Read, when present:

- the FEAT `FeatureDescription.md`;
- linked EPIC `EpicDescription.md` files;
- `Hepha Deep-Dive Decisions` in the FEAT or linked EPICs;
- existing project UI language, design guidance, screenshots, or frontend docs;
- relevant MemoryBank `LessonsLearned` active rules.

## Required Outputs

Create or update these files in the FEAT folder:

- `UX-research-report.md`
- `Wireframes-design.md`
- `design-summary.md`

The files must be non-empty Markdown and actionable for `refine-feature`.

## Content Requirements

`UX-research-report.md` must cover:

- target users and jobs;
- primary workflow and entry points;
- alternate, empty, loading, disabled, and error states;
- accessibility and keyboard/focus considerations;
- open product questions or assumptions.

`Wireframes-design.md` must cover:

- text wireframes or state sketches;
- screen, panel, modal, or component boundaries;
- fields, actions, validation states, and interaction behavior;
- responsive and edge-state expectations when relevant.

`design-summary.md` must cover:

- final design decisions;
- implementation checklist for refinement;
- UI states that phase planning must preserve;
- risks, assumptions, and out-of-scope items.

## Safety

- Do not implement source code.
- Do not create `FeatureTasks.md` or phase files.
- Do not move the FEAT to Ready To Develop.
- Do not run complete-feature or implementation workflows.
- Stop with a blocker if product decisions cannot be safely inferred from the
  FEAT, linked EPICs, and Deep-Dive decisions.
