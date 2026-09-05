# FEAT-062: Worker Injection, Runtime Evidence, And Migration

**Feature ID**: FEAT-062
**Parent Epic**: EPIC-011
**Status**: Completed
**Priority**: P1

## Summary

Implement the EPIC-011 runtime execution slice that consumes `HandoffPlanV1` and turns its approved routing decisions into isolated Pi worker execution.

This feature owns worker launch injection, route pinning, runtime classification and single execution of the plan-authorized optional second step, nested-worker execution, durable invocation receipts, FEAT Details phase runtime-evidence projections, and migration away from the temporary model-key runner adaptation.

## Source

- EPIC: EPIC-011 - Model Catalog And Hierarchical Action Routing
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Scope

FEAT-062 shall:

- Consume the `HandoffPlanV1` produced by FEAT-061 directly.
- Inject the plan-selected route into isolated Pi worker launches.
- Keep each invocation pinned to its approved route.
- Classify the plan's single optional second step at runtime as either fallback or recovery.
- Execute the optional second step at most once: as fallback before substantive work or as recovery after a durable checkpoint, never both.
- Support nested-worker execution under the same plan-consumer contract.
- Persist authoritative runtime evidence in normalized invocation-chain, attempt, and route-change-event tables.
- Project runtime evidence into a focused phase panel in FEAT Details through the existing FEAT-060 phase composition seam.
- Replace the temporary model-key runner adaptation with direct `HandoffPlanV1` consumption.
- Provide unit, integration, Gherkin, and Playwright evidence for the owned EPIC-011 execution requirements.

## Ownership Boundary

### FEAT-061 Responsibilities

FEAT-061 remains the sole authority for:

- Model and worker registry behavior.
- Routing policy.
- Capability validation.
- Construction and validation of `HandoffPlanV1`.
- Selection of the primary route and the single optional second route.

FEAT-062 must not duplicate, reinterpret, or independently recalculate these decisions.

### FEAT-062 Responsibilities

FEAT-062 begins at the strict plan-consumer boundary. It owns:

- Receiving the required `HandoffPlanV1`.
- Applying the plan to isolated Pi worker launches.
- Executing the selected primary route.
- Preserving route pinning during execution.
- Classifying the plan-selected optional second route as fallback or recovery from the primary attempt's execution state.
- Executing that second route no more than once and never in both roles.
- Executing nested workers.
- Recording authoritative, durable runtime evidence.
- Exposing that evidence through the existing FEAT Details phase seam.
- Migrating the runner away from temporary model-key adaptation.

Runtime classification determines how the already selected second route is used; it does not authorize FEAT-062 to select, replace, or recalculate that route.

### FEAT-060 Integration Boundary

FEAT-062 shall add a focused phase runtime-evidence panel to FEAT Details through the existing phase composition seam supplied by FEAT-060.

FEAT-060 Models components and their existing destination remain preserved, but they do not own the runtime invocation projection. FEAT-062 must not create a competing FEAT Details composition architecture or move runtime evidence into the Models destination.

## Functional Requirements

### Worker Launch Injection

- Every owned runtime launch shall require and consume a valid `HandoffPlanV1`.
- The isolated Pi launch shall receive the worker and route selected by the plan.
- Runtime execution shall not perform an independent registry or policy lookup to replace the approved route.
- The primary route shall remain pinned for the attempt.
- Route changes are permitted only when the plan contains an optional second route and the runtime classification rules authorize its single execution.

### Optional Second-Step Semantics

`HandoffPlanV1` may contain one optional second route selected by FEAT-061. FEAT-062 shall classify and execute that route according to the primary attempt's durable execution state:

- If the primary attempt fails before substantive work begins, the second route may execute once as fallback.
- If the primary attempt reaches a durable checkpoint and subsequently requires a handoff, the second route may execute once as recovery.
- The same second route shall never execute as both fallback and recovery for one invocation chain.
- The second route shall not execute more than once.
- Failure of the second attempt shall terminate the plan-authorized route sequence; it shall not trigger recursive rerouting.
- If the primary failure satisfies neither the fallback nor recovery condition, the invocation shall fail without executing the second route.
- If the plan does not provide a second route, FEAT-062 shall not invent one.

The classification, reason, source attempt, target attempt, and resulting outcome shall be recorded durably.

### Fallback And Recovery

- A failed primary attempt may activate only the second route authorized by `HandoffPlanV1`.
- Fallback is limited to one execution before substantive work.
- Recovery is limited to one execution after a durable checkpoint.
- Runtime execution shall not invent additional fallback or recovery routes.
- Runtime execution shall not recursively reroute after the permitted second attempt.
- Every primary, fallback, and recovery attempt shall produce durable evidence.
- The durable evidence shall distinguish fallback from recovery even though both use the plan's same optional second-step slot.

### Nested-Worker Execution

- Each nested worker shall execute through the same strict `HandoffPlanV1` consumer boundary.
- A nested worker shall receive its own FEAT-061-authorized plan rather than inheriting authority to choose routes from its parent.
- Nested execution shall preserve its relationship to the parent invocation chain in authoritative runtime evidence.
- Nested workers shall not bypass FEAT-061 policy, registry, or capability-validation authority.
- Nested primary execution, optional second-step classification, fallback or recovery execution, and completion outcomes shall be represented in durable receipts.
- Each nested invocation chain shall independently enforce the one-second-step, never-both rule of its governing plan.

### Durable Invocation Receipts

Normalized runtime persistence shall be the single authority for invocation execution evidence.

The persistence model shall represent:

- Invocation chains, including the governing handoff plan and parent or nested lineage.
- Attempts, including worker, route, role, sequence, timing, checkpoint state, and outcome.
- Route-change events, including fallback or recovery classification, reason, source attempt, target attempt, and outcome.

Together, these records shall persist enough evidence to determine:

- Which approved `HandoffPlanV1` governed the invocation.
- Which worker and route were attempted.
- Whether an attempt was primary, fallback, recovery, or part of nested execution.
- The relationship between parent and nested invocation chains.
- Whether substantive work began or a durable checkpoint was reached before a second-step decision.
- The execution outcome of each attempt.
- The sequence of plan-authorized attempts and handoffs.
- The final invocation result.

These normalized tables are authoritative. Existing runtime projections shall be derived from them rather than treated as competing sources of truth.

Receipts shall remain available after the active runtime process ends so they can support auditing, recovery, testing, and FEAT Details projections.

Where historical or legacy rows lack evidence required by the normalized contract:

- The projection shall display the missing value as **Not recorded**.
- Missing evidence shall not be inferred or fabricated.
- Legacy incompleteness shall not prevent complete normalized records from being authoritative for new executions.

### FEAT Details Projection

FEAT Details shall expose runtime evidence through a focused phase runtime-evidence panel composed using the existing FEAT-060 phase seam.

The panel shall derive its state from the authoritative normalized runtime tables and expose, as available:

- The approved and executed routes.
- Primary and optional second-step attempt outcomes.
- Whether the second step was classified as fallback or recovery.
- Route-change reasons and sequence.
- Durable checkpoint evidence relevant to recovery.
- Nested-worker relationships and outcomes.
- The final invocation result.
- **Not recorded** for unavailable fields in incomplete legacy records.

The projection shall not:

- Treat UI state as authoritative runtime evidence.
- Place ownership of runtime invocation display in FEAT-060 Models components.
- Replace or duplicate FEAT-060's FEAT Details composition architecture.

### Runtime Migration

- Replace the temporary model-key runner adaptation with direct `HandoffPlanV1` consumption.
- Ensure worker launch, second-step classification, fallback, recovery, nested execution, receipt persistence, and Details projection operate through the new contract.
- Write new runtime evidence to the normalized authoritative tables.
- Derive existing runtime projections from the normalized authority where those projections remain required.
- Classify unavailable fields in incomplete legacy data as **Not recorded** rather than fabricating migration values.
- Remove runtime dependence on the temporary adaptation once the direct plan-consumer path is active.
- Preserve FEAT-061 as the sole routing and validation authority throughout migration.

## Acceptance Criteria

- [x] An isolated Pi worker can be launched directly from a valid `HandoffPlanV1`.
- [x] The launched worker uses the route selected by the plan without independently recalculating routing policy.
- [x] The primary attempt remains pinned to its selected route.
- [x] When the primary fails before substantive work, the plan's optional second route can execute once as fallback.
- [x] When the primary requires handoff after a durable checkpoint, the plan's optional second route can execute once as recovery.
- [x] The optional second route is never executed as both fallback and recovery for the same invocation chain.
- [x] The optional second route cannot execute more than once or recursively reroute after failure.
- [x] A failure that satisfies neither second-step classification condition terminates without executing the optional second route.
- [x] FEAT-062 never invents or independently selects a fallback or recovery route.
- [x] Nested workers execute through the same plan-consumer contract and retain a durable relationship to their parent invocation.
- [x] Each nested invocation independently enforces its governing plan's single optional second-step rule.
- [x] Invocation chains, attempts, and route-change events are persisted in normalized authoritative runtime tables.
- [x] Primary, fallback, recovery, and nested-worker attempts produce durable invocation receipts.
- [x] Persisted receipts provide sufficient evidence to reconstruct the governing plan, approved route, actual attempts, second-step classification, handoffs, lineage, outcomes, and final result.
- [x] Existing runtime projections are derived from the normalized authoritative persistence model.
- [x] Incomplete legacy evidence is presented as **Not recorded** and is not inferred or fabricated.
- [x] FEAT Details displays a focused phase runtime-evidence panel through the existing FEAT-060 phase composition seam.
- [x] FEAT-060 Models components remain preserved and do not own the runtime invocation projection.
- [x] The temporary model-key runner adaptation is replaced by direct `HandoffPlanV1` consumption.
- [x] No FEAT-062 runtime path duplicates FEAT-061 registry, routing-policy, capability-validation, route-selection, or plan-construction responsibilities.
- [x] Unit tests cover launch injection, route pinning, second-step classification, fallback and recovery exclusivity, one-execution limits, nested-worker lineage, normalized receipt persistence, legacy classification, and migration behavior.
- [x] Integration tests verify plan consumption across worker launch, fallback or recovery, normalized receipt persistence, nested lineage, and FEAT Details projection boundaries.
- [x] Gherkin scenarios trace the owned execution behavior for `E011-LAUNCH`, `E011-EVID`, and the execution portions of `E011-FAIL` and `E011-NEST`.
- [x] Playwright tests verify the FEAT Details phase runtime-evidence projection from persisted invocation data, including **Not recorded** legacy fields.

## Epic Traceability

| EPIC-011 Evidence | FEAT-062 Responsibility | Required Evidence |
|---|---|---|
| `E011-LAUNCH` | Isolated Pi launch injection and route pinning from `HandoffPlanV1` | Unit, integration, Gherkin |
| `E011-EVID` | Normalized authoritative runtime receipts and FEAT Details phase runtime-evidence projection | Unit, integration, Gherkin, Playwright |
| `E011-FAIL` execution scope | Runtime classification and single execution of the optional second route as fallback or recovery, never both | Unit, integration, Gherkin |
| `E011-NEST` execution scope | Nested-worker launch, parent lineage, independent plan consumption, execution, and receipts | Unit, integration, Gherkin, Playwright where projected |

## Out of Scope

- Defining or owning the model and worker registry.
- Selecting primary or optional second routes.
- Selecting routing policy.
- Performing authoritative capability validation.
- Constructing or redefining `HandoffPlanV1`.
- Creating alternative fallback or recovery routes beyond the optional second route authorized by the plan.
- Executing both fallback and recovery for one invocation chain.
- Recursively rerouting after the authorized second attempt.
- Replacing FEAT-060 FEAT Details composition architecture.
- Assigning runtime invocation projection ownership to FEAT-060 Models components.
- Fabricating missing evidence for incomplete legacy runtime rows.
- Reimplementing responsibilities assigned to FEAT-060 or FEAT-061.

## Dependencies

- **FEAT-060**: Provides the existing FEAT Details phase composition seam used for the focused runtime-evidence panel. Its Models components remain preserved but do not own this projection.
- **FEAT-061**: Provides the authoritative registry, routing policy, capability validation, route selection, and `HandoffPlanV1`, including its single optional second route.

## Hepha Deep-Dive Decisions

Recorded: 2026-07-23T16:03:54.131Z

Hepha applied these saved Deep-Dive answers directly because the full-document model rewrite did not finish.
Fallback reason: Source document is 16893 characters; deterministic update is used above 12000 characters.

### Changed FeatureDescription scope

Question: The Deep-Dive source changed in: Closed read contract and ownership, Component boundaries, Content and terminology, Disclosure, Final design decisions, Frozen decisions and implementation checks, Information architecture and ownership, Interaction, focus, and layout, Primary workflow and entry points, Product assumptions and non-blocking questions, Product assumptions and resolved planning decisions, Questions for refinement to confirm without changing the design direction, Refresh and live updates, Required UI states, Risks, assumptions, and mitigations, Summary rules, Test and evidence plan. Confirm the intended implementation decision for these changes; Hepha will not infer an answer.

Decision: **Confirm current scope** - The current FeatureDescription is the intended scope for the in-progress implementation.

## Validation

The feature scope is confirmed as the complete EPIC-011 runtime execution slice.

Refinement and implementation planning shall preserve these invariants:

1. FEAT-061 decides and validates every route.
2. FEAT-062 consumes the resulting plan without recalculating routing policy.
3. A plan's optional second route executes at most once as fallback or recovery, never both.
4. Normalized invocation-chain, attempt, and route-change-event tables are the authoritative runtime evidence source.
5. Missing legacy evidence is displayed as **Not recorded**, not inferred.
6. Runtime evidence is projected through the existing FEAT Details phase seam rather than the FEAT-060 Models destination.
