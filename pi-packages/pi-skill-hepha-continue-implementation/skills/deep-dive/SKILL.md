---
name: deep-dive
description: Use when the user asks Pi to run a HEPHA Deep-Dive for an EPIC or FEAT, gather Deep-Dive questions, or apply saved Deep-Dive answers to a MemoryBank document, for example "use the deep-dive skill for HEPHA FEAT-004".
agent_action: deep-dive
---

# Deep-Dive

## Model Authority

This procedure is model-neutral. When invoked directly, execution is
`direct_host` and remains in the current Pi, Codex, or Claude Code session; that
active host owns model selection. Do not query Hepha routing policy, request a
model switch, automatically hand off, choose a fallback model, or fabricate
route-policy evidence. Direct execution does not fabricate an orchestrated
receipt. Only an explicit Hepha launcher or dashboard dispatch creates a
separate `orchestrated` worker, whose route is injected outside this skill.

You are executing the HEPHA `deep-dive-feature` or `deep-dive-epic`
workflow directly from Pi.

This skill supports two stages:

1. Gather the Deep-Dive question round.
2. Apply saved Deep-Dive answers to the source Markdown document.

When HEPHA invokes this skill, the user prompt will specify which stage is
running and the required output format. Follow that requested output format
exactly. When a user invokes the skill directly from the console without a
stage, start with stage 1 and ask the question round before editing files.

## Required Inputs

Accept these from the user's message:

- project name or alias, such as `HEPHA`, `Hepha`, or
  `AgenticDevelopmentProcess`;
- EPIC or FEAT id, such as `EPIC-002` or `FEAT-004`;
- optional MemoryBank path override;
- optional stage instruction, such as question gathering or answer application.

If the work item id is missing, ask one concise question. Otherwise, infer
safely.

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

## MemoryBank And Work Item Resolution

Resolve the MemoryBank in this order:

1. User-supplied MemoryBank path, if present.
2. `.hepha/projects.json` in the child project, matching project `name`, `id`,
   or child root path.
3. `<child project root>/MemoryBank` when it contains `Features/`.
4. A direct search under the child root for `MemoryBank/Features`.

Then resolve the work item:

1. Normalize the requested id to uppercase, for example `FEAT-004`.
2. Search all workflow folders under `<MemoryBank>/Features`.
3. Match by folder name first, then by `EpicDescription.md` or
   `FeatureDescription.md` content.
4. EPIC source documents are `EpicDescription.md`; FEAT source documents are
   `FeatureDescription.md`.
5. Stop with a blocker if the source document cannot be read.

## Stage 1: Gather Questions

Use this mode when the prompt asks to gather, generate, or produce the
Deep-Dive question round.

Rules:

- Do not edit files.
- Inspect the source document and any `[NEEDS VALIDATION]` markers.
- Ask one question per validation marker when markers exist.
- If no markers exist, ask three readiness questions for downstream planning.
- Make every option an actionable decision, not a generic yes/no.
- Prefer the least risky option as the recommended option when evidence is
  incomplete.
- If HEPHA provides a JSON schema, return JSON only and exactly match it.

## Stage 2: Apply Answers

Use this mode when the prompt asks to apply saved answers, update the document,
or rewrite the source Markdown.

Rules:

- Use the original document and answered transcript provided by HEPHA.
- Resolve or remove `[NEEDS VALIDATION]` markers using the saved decisions.
- Preserve useful existing headings, tables, links, Mermaid diagrams, and
  acceptance criteria.
- Add or update a concise `Hepha Deep-Dive Decisions` section when that helps
  preserve traceability.
- Return only the complete updated Markdown document when HEPHA requests that
  format.
- Do not create implementation phase files, branches, commits, or code changes.

When running directly from the console and you edit the source document
yourself, sync HEPHA SQLite metadata after the write when `.hepha/hepha.sqlite`
exists. Use the bundled helper when available:

```bash
node pi-packages/pi-skill-hepha-continue-implementation/skills/deep-dive/scripts/sync-deep-dive-state.mjs \
  --project-root <project-root> \
  --memory-bank <memory-bank-path> \
  --item-id <EPIC-or-FEAT-ID> \
  --source-document <FeatureDescription-or-EpicDescription-path> \
  --summary "Completed <ID> Deep-Dive through direct Pi skill."
```

If the helper is unavailable, `node:sqlite` is unsupported, no matching metadata
row exists, or another non-deep-dive workflow is running for the same card,
report that metadata sync was skipped. Do not undo the document update.

When HEPHA invokes this skill and asks for JSON only or for the complete updated
Markdown only, do not run this helper inside the model response. HEPHA owns the
metadata sync for hosted UI runs.

## Safety

- Do not invent user decisions. If an answer is missing or ambiguous, stop with
  a blocker.
- Do not move FEAT folders between MemoryBank states.
- Do not start implementation, code review, or complete-feature work from this
  skill.
- Keep the result focused on requirement clarification and source-document
  readiness.
