# FEAT-035: Workflow Position Summary On Cards And FEAT Details

**Feature ID**: FEAT-035
**Parent Epic**: EPIC-007
**Status**: Completed

## Summary

Define a workflow-position server read-model DTO from durable run timeline state and phase lifecycle events. Keep command labels, execution state, active phase number/title, quality-gate state, and Deep-Dive freshness as separate concepts. Update FEAT cards to show a compact structured status stack and add a pinned workflow-position synopsis in the FEAT detail header. Establish phase status precedence: durable events, then phase documents, then card metadata, then FeatureTasks planning rows. Define semantic Deep-Dive freshness through a normalized section classifier so lifecycle metadata changes do not force a new Deep-Dive while requirement, scope, acceptance criteria, user decisions, constraints, or EPIC-alignment changes do.

## Source

- EPIC: EPIC-007 - Observability Traces And Run Analytics
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- FEAT-035 is accepted as a bounded EPIC-007 observability presentation/read-model feature.
- The feature must use existing durable workflow state and phase lifecycle evidence.
- The feature must not introduce command execution, workflow mutation, or broad lifecycle rewrites.
- The workflow-position view model must be derived on the server side as a read-model DTO:
  - implement pure orchestrator query/mapper functions;
  - expose standalone additive API response fields;
  - let the web UI render the derived model without re-deriving workflow semantics.
- The UI presentation contract is a structured status stack:
  - render separate compact rows or chips for command label, execution state, active phase, quality gate, and Deep-Dive freshness;
  - hide unknown fields;
  - never treat a command label as an execution state unless durable execution state confirms it.
- Deep-Dive freshness must use a semantic-section classifier:
  - compare normalized requirement, scope, acceptance criteria, user decisions, constraints, and EPIC-alignment sections;
  - ignore ordinary lifecycle metadata churn such as status changes, commits, receipts, timestamps, and generated execution metadata.
- The preferred scope is a read-model plus UI synopsis:
  - define a pure workflow-position view model from durable timeline/events;
  - apply documented fallback precedence;
  - show compact workflow status on FEAT cards;
  - pin the workflow-position synopsis in the FEAT detail header;
  - classify semantic Deep-Dive freshness;
  - cover view-model contracts with tests.

## Scope

FEAT-035 covers presentation and read-model behavior for workflow-position summaries.

In scope:

- Pure orchestrator query/mapper functions that derive a workflow-position server read-model DTO from existing durable timeline state, phase lifecycle events, and documented fallbacks.
- Additive API response fields exposing the derived workflow-position DTO for FEAT cards and FEAT detail pages.
- A compact structured workflow-position status stack for FEAT cards.
- A pinned workflow-position synopsis in the FEAT detail header.
- Clear separation between:
  - command label;
  - command execution state;
  - active phase number and title;
  - quality-gate state;
  - semantic Deep-Dive freshness.
- Deterministic fallback precedence when durable evidence is partial.
- A semantic-section classifier for Deep-Dive freshness that compares normalized requirement/scope-relevant sections while ignoring lifecycle metadata churn.
- Contract tests for read-model derivation, fallback behavior, API DTO shape, UI rendering inputs, and semantic freshness classification.

Out of scope:

- Executing commands.
- Mutating workflow state.
- Rewriting workflow lifecycle rules broadly.
- Changing phase orchestration semantics.
- Replacing durable timeline or lifecycle persistence.
- Requiring the web UI to infer workflow semantics that should be derived by the orchestrator read model.

## Workflow-Position Read Model

The feature should expose a pure server-side read model that can be rendered consistently on cards and detail pages.

The read model should be derived by orchestrator query/mapper functions and exposed through standalone additive API response fields. The web UI should consume and render the DTO without duplicating lifecycle precedence logic or semantic Deep-Dive freshness rules.

The read model should include, at minimum:

| Field | Purpose |
| --- | --- |
| `commandLabel` | Human-readable label for the current or most recent workflow command. |
| `executionState` | Current execution state, such as idle, queued, running, blocked, failed, completed, or unknown. |
| `activePhaseNumber` | Current phase number when known. |
| `activePhaseTitle` | Current phase title when known. |
| `phaseStatus` | Derived phase lifecycle status. |
| `qualityGateState` | Current quality-gate state when available. |
| `deepDiveFreshness` | Semantic freshness classification for Deep-Dive readiness. |
| `synopsis` | Compact human-readable summary suitable for FEAT detail header display. |
| `evidence` | Source evidence used to derive the model, useful for debugging and tests. |

Unknown or unavailable fields should remain absent or explicitly unknown in the DTO and should be hidden by compact UI renderers where appropriate.

## Phase Status Precedence

When multiple sources provide phase status information, use this precedence order:

1. Durable run timeline events and phase lifecycle events.
2. Phase documents.
3. Card metadata.
4. FeatureTasks planning rows.

Higher-precedence evidence must override lower-precedence evidence. Lower-precedence evidence should be used only when higher-precedence state is missing or incomplete.

## API Contract

The workflow-position DTO must be exposed as additive response data so existing consumers are not broken.

API behavior should follow these rules:

- The orchestrator owns derivation of workflow position.
- The API exposes the derived DTO for card lists and FEAT detail reads.
- The DTO must preserve separate fields for command label, execution state, active phase, quality gate, and Deep-Dive freshness.
- The DTO should include enough evidence metadata for deterministic tests and debugging.
- Missing durable evidence should not cause UI failure; the DTO should degrade through the documented fallback precedence.

## UI Requirements

### FEAT Cards

FEAT cards should show a compact structured workflow-position status stack that helps users understand where the item is in the workflow without opening the detail page.

The card display should include separate compact rows or chips for:

- current execution state;
- active phase number/title when available;
- quality-gate state when relevant;
- compact command label when useful;
- Deep-Dive freshness indicator when it affects readiness.

Unknown fields should be hidden rather than rendered as noisy placeholders.

The card must avoid conflating command labels with execution state. For example, a card must not treat “continue implementation” as equivalent to “running” unless durable execution state confirms that execution is running.

### FEAT Detail Header

The FEAT detail page should include a pinned workflow-position synopsis near the header so the current workflow position remains visible while reviewing the feature.

The synopsis should summarize:

- current workflow command or last meaningful command;
- execution state;
- active phase;
- quality-gate state;
- Deep-Dive semantic freshness when relevant.

The detail header may render the same structured fields as the card, with room for a clearer synopsis and evidence/debug affordances where appropriate.

## Semantic Deep-Dive Freshness

Deep-Dive freshness should be based on requirement and scope meaning, not ordinary lifecycle metadata churn.

The feature must implement a semantic-section classifier that compares normalized sections relevant to requirements and planning. The classifier should reconsider Deep-Dive freshness when meaningful content changes are detected in sections such as:

- requirements;
- acceptance criteria;
- scope;
- user decisions;
- implementation-relevant constraints;
- design constraints;
- parent EPIC alignment;
- feature intent.

Changes that should not force a new Deep-Dive by themselves:

- workflow status changes;
- implementation commits;
- review receipts;
- command receipts;
- lifecycle timestamps;
- generated execution metadata.

Changes that should require Deep-Dive freshness to be reconsidered:

- requirement changes;
- acceptance criteria changes;
- scope expansion or reduction;
- user decision changes;
- design constraints that alter implementation planning;
- changes to feature intent or parent EPIC alignment.

## Acceptance Criteria

- A pure workflow-position server read-model DTO is defined from existing durable run timeline state and phase lifecycle events.
- The DTO is derived by orchestrator query/mapper functions, not by duplicated UI lifecycle logic.
- The derived model is exposed through standalone additive API response fields for FEAT cards and FEAT detail reads.
- The read model keeps command label, command execution state, active phase number/title, quality-gate state, and Deep-Dive freshness as separate concepts.
- The read model uses the documented fallback precedence: durable events first, then phase documents, then card metadata, then FeatureTasks planning rows.
- FEAT cards render a compact structured workflow-position status stack based on the read model.
- FEAT cards and detail views hide unknown workflow-position fields instead of displaying noisy placeholders.
- FEAT detail pages render a pinned workflow-position synopsis in the header area.
- Semantic Deep-Dive freshness uses a normalized semantic-section classifier.
- Semantic Deep-Dive freshness distinguishes requirement/scope changes from lifecycle metadata changes.
- Lifecycle metadata changes such as status updates, commits, receipts, timestamps, and generated execution metadata do not force a new Deep-Dive by themselves.
- Requirement, scope, acceptance-criteria, user-decision, constraint, feature-intent, or EPIC-alignment changes cause Deep-Dive freshness to be reconsidered.
- The implementation does not execute commands, mutate workflow state, or rewrite broad lifecycle behavior.
- Contract tests cover read-model derivation, fallback precedence, additive API DTO shape, card/detail display inputs, and semantic Deep-Dive freshness classification.

## Validation

Proceed with FEAT-035 as an EPIC-007 observability presentation/read-model feature using existing durable state.

The scope is ready for feature refinement, design decisions, and implementation planning.
