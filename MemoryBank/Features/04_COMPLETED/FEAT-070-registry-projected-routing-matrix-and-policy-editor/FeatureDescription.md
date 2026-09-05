# FEAT-070: Registry-Projected Routing Matrix And Policy Editor

**Feature ID**: FEAT-070
**Parent Epic**: EPIC-011
**Status**: Completed
**Priority**: P1
**Owner**: Paulo Aboim Pinto
**External Reference**: `docs/architecture/epic-011-model-authority-and-portable-skill-execution.md`

## Summary

Complete the Routing Defaults experience by projecting every canonical Agent
Registry action type and action into a grouped, editable routing matrix. The
current backend registry contains 17 actions across five action types, but the
live routing policy contains only Global Default and the UI renders only
persisted selectors. As a result, operators cannot see or configure Planning,
Implementation, Review, Completion, Start Feature, Continue Implementing, or
other registered routes.

## Source

- EPIC: EPIC-011 — Model Catalog And Hierarchical Action Routing.
- Corrective feature created after production inspection of FEAT-061's
  Global-only bootstrap and selector-driven UI.

## Problem And Evidence

The routing resolver already implements Action -> Action Type -> Global
precedence and the Agent Registry contains the required actions. The missing
capability is the complete policy projection and editor:

- bootstrap may persist only the Global selector;
- missing selectors semantically mean `Inherit` but are not returned as rows;
- `RoutingDefaultsPanel.tsx` maps only `policy.selectors`;
- the operator cannot create an override for a scope that has no rendered row;
- selectors show immutable connection UUIDs instead of friendly labels;
- failure policies are not fully editable in the current panel;
- FEAT-061 tests used a prepared Review/Code Review fixture rather than a real
  Global-only policy plus the complete canonical registry.

The EPIC explicitly required all action-type and action selectors, inherited
effective routes, policy sources, and failure-policy choices. This feature
makes that requirement executable without discarding immutable policy history.

## User And Workflow Use

The matrix configures the workers used by:

- Discovery & Planning: Submit EPIC, Refine EPIC, Submit Feature, Deep-Dive,
  Design Feature, Refine Feature, and UI requirement evaluation;
- Implementation: Start Feature, Continue Implementing, phase workers, review
  finding repair, and workflow recovery;
- Review: Code Review;
- Completion: Complete Feature;
- Knowledge & Documentation: Phase Lessons Capture, Feature Lessons Writer,
  and Post-Complete LessonsLearned Curator.

Operators need this screen before running these actions so each future worker
uses the intended connection/model and every inherited choice is explainable.

## Product Decisions

- SQLite policy persistence may remain sparse: Global is mandatory and missing
  non-global selectors mean `Inherit`.
- The server, not the browser, joins Agent Registry, current policy, provider
  connection labels, catalog eligibility, and resolver previews into a complete
  routing-matrix read model.
- The matrix always contains one Global row, one row per registered action
  type, and one row per registered action grouped below its type.
- New registry actions automatically appear as inherited rows without a policy
  data migration.
- Registry entries gain stable human-readable labels and deterministic display
  ordering without changing action IDs.
- Selecting `Inherit` removes the explicit override in a new immutable policy
  revision; it never deletes Global or invents another model.
- Every row shows both its configured selector and its effective route, failure
  policy, and policy source.
- Friendly connection labels are presented to humans while API mutations,
  policy dependencies, and receipts retain immutable connection IDs.
- Capability-ineligible routes are disabled or rejected with each unmet
  requirement explained.
- Global cannot inherit and always fails immediately.
- A non-global explicit route supports fail immediately, reroute once to Global,
  or reroute once to a selected distinct eligible route. Cycles and fallback to
  the primary route remain impossible.
- An inherited non-global row exposes its effective route and failure policy as
  read-only. Failure-policy editing becomes available only after the operator
  selects an explicit route.
- Route and failure-policy changes are saved atomically at row level using
  optimistic revision control.

## Hepha Deep-Dive Decisions

Recorded: 2026-07-25T00:13:47.921Z

Hepha applied these saved Deep-Dive answers directly because the full-document model rewrite did not finish.
Fallback reason: Source document is 14426 characters; deterministic update is used above 12000 characters.

### Save settlement contract

Question: The Feature requires Save to return the complete snapshot, while UX research still treats a guarded GET as equivalent. Which contract governs refinement?

Decision: **Direct complete snapshot** - Save returns the fully validated new V1 snapshot and guard; web reconciliation has one producer-to-consumer contract.

### Inherited failure semantics

Question: When a non-global row resolves directly to Global because no action or type override exists, which effective failure policy must the snapshot show?

Decision: **Inherit Global fail immediately** - Show Global's fail-immediately policy and prohibit a meaningless self-reroute to the same effective route.

### Reset-attention acknowledgement

Question: How should PROV-003 acknowledgement settle so retries are identity-safe, drafts remain intact, and acknowledgement cannot imply route repair?

Decision: **Identity-bound endpoint returns snapshot** - Use a typed idempotent endpoint keyed by attention identity and expected guard; acknowledge only the attention and return the complete refreshed snapshot.

## Routing Matrix DTO And Mutation Boundary

The read endpoint returns the complete hierarchical snapshot in one guarded
response. A Global-only sparse policy therefore returns the same complete row
hierarchy as a policy with multiple explicit overrides.

Row mutations must identify:

- the policy;
- the edited scope;
- the intended configured route or `Inherit`;
- the complete explicit failure policy when an explicit non-global route is
  selected;
- the expected revision and revision guard.

A successful mutation creates exactly one immutable policy revision and returns
or refreshes the complete authoritative snapshot. A validation failure,
eligibility failure, unavailable route, invalid fallback, cycle, or revision
conflict creates no revision.

The server must reject:

- `Inherit` for Global;
- any Global failure mode other than fail immediately;
- an explicit route that is unavailable or capability-ineligible;
- a reroute target equal to the row's primary route;
- an unavailable or capability-ineligible fallback route;
- a fallback configuration that creates a cycle;
- a mutation based on a stale revision guard.

## Required UI Shape

```text
Global Default
  [OpenAI · gpt-5.6-sol]                  Effective: same · Global

Discovery & Planning
  Type default [Inherit]                  Effective: OpenAI… · Global
  Deep-Dive [Inherit]                     Effective: OpenAI… · Global
  Submit EPIC [Inherit]                   Effective: OpenAI… · Global
  ...

Implementation
  Type default [DeepSeek · v4-pro]         Effective: DeepSeek… · Action type
  Start Feature [Inherit]                  Effective: DeepSeek… · Action type
  Continue Implementing [OpenAI · ...]    Effective: OpenAI… · Action
  ...
```

Rows may use accessible disclosure/group components on narrow screens, but the
complete hierarchy, configured choice, effective source, eligibility,
failure-policy state, and save behavior must remain keyboard accessible.

Each row has its own editing and save boundary. Editing one row must not obscure
or mutate unsaved values in another row. Inherited failure-policy controls are
read-only until an explicit route is selected.

## Failure-Policy Editing

Global always uses fail immediately and exposes no inheritance or fallback
controls.

For an explicit non-global route, the editor supports:

1. fail immediately;
2. reroute once to Global;
3. reroute once to a selected distinct eligible route.

When the third mode is selected, the fallback selector shows friendly
connection and model labels, disables invalid choices, and explains why each
unavailable or capability-ineligible route cannot be selected. Client-side
guidance does not replace authoritative server validation.

The editor owns configuration and validation of these choices. Executing a
fallback during worker operation remains outside FEAT-070.

## Acceptance Criteria

### Projection And Resolution

- A Global-only persisted policy projects exactly one Global row, every
  canonical action type, and every canonical action without first writing a
  policy revision.
- The response is one V1 hierarchical snapshot bound to the current immutable
  policy revision and optimistic concurrency guard.
- All projected non-global rows initially show `Inherit`, their effective route,
  effective failure policy, and the correct `Global` policy source.
- An action-type override changes effective routes only for inherited actions
  in that type; an action override takes precedence only for that action.
- Start Feature and Continue Implementing are independently visible and
  configurable under Implementation.
- Code Review is visible under Review, Complete Feature under Completion, and
  all three LessonsLearned actions under Knowledge & Documentation.
- Adding a registry fixture action produces a new inherited row without a
  database or policy migration.
- Every action returned by `AgentRegistry.list()` has exactly one action row and
  one effective-route explanation.
- Registry labels and ordering are deterministic across repeated reads.

### Editing And Revisions

- An inherited row shows its effective route and failure policy as read-only.
- Selecting an explicit route enables failure-policy editing for that row.
- One row-level Save atomically validates the route and failure policy and
  creates exactly one immutable revision.
- Selecting `Inherit` for an existing override creates a new immutable revision
  that removes the explicit selector and failure policy and exposes the newly
  inherited route.
- A stale revision is rejected without overwriting newer policy changes or
  creating a revision.
- A successful save returns or causes the editor to load a new authoritative
  hierarchical snapshot.

### Labels, Eligibility, And Failure Policies

- Each selectable model is shown as friendly connection label plus model ID; no
  connection UUID is the primary human label.
- Capability-ineligible models cannot be saved and every unmet capability is
  explained before mutation.
- Operators can configure each supported non-global failure policy.
- Invalid primary/fallback equality, unavailable fallback, ineligible fallback,
  and fallback cycles are rejected without creating a revision.
- Global cannot inherit, cannot select another failure mode, and always fails
  immediately.

### Safe And Accessible Editor States

- Loading, empty-catalog, unavailable-Global, revision-conflict,
  reset-attention, validation-failure, and save-failure states remain safe and
  accessible.
- SAFE-001 and SAFE-002 editor-facing behavior is covered by executable
  acceptance tests.
- PROV-003 reset-attention state is included in the server snapshot and visibly
  represented without allowing an unsafe save.
- A failed or conflicted save does not falsely present pending values as
  persisted.
- Keyboard and screen-reader users can navigate groups, inspect configured and
  effective routes, understand disabled choices, edit a row, and receive save
  or error feedback.

### Verification Coverage

- Unit, store/service integration, HTTP contract, Gherkin, and Playwright tests
  use the complete production registry and a real Global-only bootstrap case,
  not a one-action prepared fixture.
- Tests trace E011-ROUTE-006 through E011-ROUTE-010 into resolver/API
  integration and browser-visible behavior.
- Gherkin and browser coverage include SAFE-001, SAFE-002, PROV-003,
  invalid-fallback rejection, and revision-conflict handling.
- Runtime fallback execution is verified by its existing owners rather than
  duplicated in FEAT-070 acceptance coverage.

## Dependencies

- FEAT-059 — eligible catalog identities and model capability facts.
- FEAT-061 — Agent Registry, sparse policy persistence, resolver, revisions,
  loop prevention, and policy API foundation.
- FEAT-069 — complete active-connection catalog and scan-state reconciliation.

## Scope And Boundaries

### In Scope

- registry display metadata and grouping;
- the closed V1 hierarchical routing-matrix snapshot;
- complete server-side routing-matrix projection;
- sparse-policy mutation semantics;
- optimistic, row-level atomic saves;
- accessible full policy editor and friendly labels;
- failure-policy editor completion;
- SAFE-001 and SAFE-002 editor-facing behavior;
- PROV-003 reset-attention presentation;
- canonical-registry acceptance coverage.

### Out Of Scope

- project-specific routing defaults;
- autonomous route selection by cost or benchmark;
- changing active worker routes;
- actual worker fallback execution;
- skill/workflow model-authority migration, owned by FEAT-071;
- redesigning provider credential management.

## Validation And Refinement Readiness

Refinement must preserve the accepted sparse-persistence,
complete-server-projection, hierarchical V1 snapshot, and atomic row-save
contracts.

Implementation planning must:

- map the V1 snapshot fields to concrete transport types without shifting
  projection or resolution responsibility into the browser;
- define the row mutation request and conflict response around the policy
  revision guard;
- preserve immutable policy history for explicit-route, failure-policy, and
  `Inherit` changes;
- trace E011-ROUTE-006 through E011-ROUTE-010, SAFE-001, SAFE-002, and PROV-003
  into unit, integration, HTTP, Gherkin, and Playwright evidence;
- verify that every action returned by `AgentRegistry.list()` has exactly one
  matrix row and an authoritative effective-route explanation;
- verify that rejected mutations never create a policy revision.
