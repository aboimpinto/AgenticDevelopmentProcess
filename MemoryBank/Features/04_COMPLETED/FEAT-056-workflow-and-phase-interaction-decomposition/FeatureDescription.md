# FEAT-056: Workflow And Phase Interaction Decomposition

**Feature ID**: FEAT-056  
**Parent Epic**: EPIC-012  
**Status**: Completed

## Summary

Extract workflow history, readiness, phase list, lifecycle controls, blocked recovery, manual tests, user review, and findings UI into focused domain/service modules with thin UI adapters. UI components render authoritative state snapshots and dispatch typed commands without duplicating workflow policy.

Deliver the work as incremental journey-by-journey vertical slices. Each slice must include policy, integration, Gherkin, and Playwright evidence before the next journey begins.

## Source

- EPIC: EPIC-012 - Web Application Architecture And Test Quality
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

### Module Boundaries

Use focused domain services with thin UI adapters.

- Domain and service modules own workflow policy, readiness evaluation, phase reconciliation, lifecycle eligibility, blocked recovery, manual-test requirements, user-review requirements, findings constraints, and completion readiness.
- Typed read contracts provide UI-ready authoritative workflow state.
- Typed command contracts accept requested user actions and invoke the relevant domain policy.
- UI adapters, API handlers, and components render returned state and dispatch commands; they do not calculate workflow readiness, transitions, recovery eligibility, or completion eligibility.

### Authoritative State Contract

Every accepted command returns an authoritative refreshed state snapshot containing:

- Workflow state and relevant workflow-history entries.
- Ordered phase state.
- Readiness status and reasons.
- Lifecycle action availability.
- Blocked dependency details and available recovery actions.
- Manual-test status.
- User-review status.
- Findings.
- Completion-readiness status and reasons.

Rejected commands return structured rejection results, including validation, blocked, unavailable, or conflict reasons, so the UI can display the result without recreating policy locally.

### Vertical-Slice Acceptance

Implement and accept the required journeys sequentially.

Each completed journey must include:

1. Relevant domain-policy and structured-result unit tests.
2. Integration tests for command and read-contract interactions.
3. A corresponding Gherkin scenario.
4. A Playwright journey covering the user-visible flow and authoritative state.

Do not begin the next journey slice until the current slice's evidence passes.

## Acceptance Criteria

### Module Boundaries And Policy Ownership

- Workflow history, readiness evaluation, phase reconciliation, lifecycle controls, blocked recovery, manual-test state, user-review state, and findings state are represented by focused domain or service modules with explicit responsibilities.
- UI-facing adapters and components render state received through typed read contracts and request actions through typed commands.
- UI components do not independently calculate workflow readiness, phase transitions, recovery eligibility, lifecycle action eligibility, or completion eligibility.
- Workflow policy is owned by domain or service modules and invoked consistently by command handlers and API endpoints.
- Each module exposes typed input and output contracts, including success, validation failure, blocked, unavailable, and conflict results where applicable.
- State mutations occur only through explicit commands and produce auditable workflow-history entries.

### API And Integration Contracts

- Read contracts provide the current workflow state, ordered phase list, readiness reasons, lifecycle action availability, blocked dependency details, manual-test status, user-review status, findings, and completion-readiness reasons required by the UI.
- Command contracts support starting and continuing workflow execution, reconciling phases, recovering blocked dependencies, recording manual-test outcomes, submitting user-review decisions, submitting findings, and evaluating completion readiness.
- Every accepted command returns the authoritative refreshed workflow snapshot, including workflow, phases, readiness, and action availability.
- Every rejected command returns a structured result with the authoritative validation, unavailable, blocked, or conflict reason.
- Contract and integration tests verify that invalid, unavailable, blocked, and conflicting commands do not produce invalid workflow transitions.

### Required User Journeys

- A user can start an eligible workflow; the system applies authoritative start policy, records history, and displays the resulting active state and next actionable phase.
- A user can continue an eligible workflow; the system determines the valid continuation action, records history, and returns updated readiness and phase state.
- When a dependency blocks progress, the UI displays the authoritative blocking reason and available recovery action; completing a valid recovery re-evaluates readiness and permits continuation only when policy requirements are satisfied.
- Phase reconciliation deterministically derives ordered phase state from workflow facts. Repeating reconciliation with unchanged inputs produces the same result and does not create duplicate or contradictory transitions.
- A user can record manual-test outcomes through the defined command contract. Failed or incomplete required tests prevent completion readiness and expose the relevant reason.
- A user can submit a user-review decision through the defined command contract. Pending, rejected, or incomplete required review prevents completion readiness and exposes the relevant reason.
- A user can submit findings associated with the workflow or relevant phase. Findings are displayed through the read contract and do not bypass workflow policy.
- Completion readiness is calculated only by the policy layer and includes required phase, dependency, manual-test, user-review, and findings conditions. The UI displays both ready and not-ready outcomes with actionable reasons.

### Delivery Sequence

Implement required user journeys as sequential vertical slices:

1. Start eligible workflow.
2. Continue eligible workflow.
3. Blocked dependency recovery.
4. Deterministic phase reconciliation.
5. Manual-test outcome recording and completion-readiness impact.
6. User-review decision recording and completion-readiness impact.
7. Finding submission and display.
8. Completion-readiness evaluation and UI presentation.

Each slice must be accepted with its relevant policy tests, integration tests, Gherkin scenario, and Playwright journey before work begins on the next slice.

### Acceptance Evidence

- Unit tests cover workflow policy, readiness evaluation, lifecycle command eligibility, blocked recovery eligibility, deterministic phase reconciliation, completion-readiness evaluation, authoritative state snapshots, and structured error results.
- Integration tests cover module boundaries and command/read-contract interactions for every required journey.
- Gherkin scenarios document start, continue, blocked dependency recovery, deterministic phase reconciliation, manual review, finding submission, and completion-readiness behaviour.
- Playwright journeys verify corresponding UI flows, including visible readiness reasons, blocked recovery, submitted manual tests, user-review outcomes, findings, and completion-ready or completion-blocked states.
- Each incremental vertical slice is accepted only when its relevant policy tests, integration tests, Gherkin scenario, and Playwright journey pass.

## Validation

- FEAT-056 scope is confirmed for refinement as an incremental journey-by-journey vertical-slice delivery plan.
- Refinement must define focused domain/service module responsibilities, typed authoritative read and command contracts, and thin UI adapters.
- Refinement must sequence implementation according to the required user journeys and require complete policy, integration, Gherkin, and Playwright evidence at every checkpoint.
