# FEAT-049: Extension API Surface For Events And Receipts

**Feature ID**: FEAT-049  
**Parent Epic**: EPIC-009  
**Status**: Completed

## Summary

Define a core, orchestrator-mediated extension API contract for event emission, receipt recording, context retrieval, question handling, and knowledge lookup. The contract must use typed, versioned APIs; preserve Hepha ownership of workflow state; enforce extension tool profiles and approval requirements at the orchestrator boundary; and surface versioned extension activity in receipts and dashboard traces.

## Source

- EPIC: EPIC-009 - Pi Skills And Extensions Integration
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- **Contract versioning**: Publish typed contracts in versioned `v1` namespaces. Compatible evolution may add optional fields; breaking changes require a new major namespace such as `v2`.
- **API boundary**: Define and implement the core mediated API contract first, covering events, receipts, context, questions, and knowledge lookup.
- **Control boundary**: Apply a central, deterministic pure policy decision at the orchestrator boundary. An orchestrator adapter enforces allow, deny, or approval-required outcomes before an extension operation can affect workflow state or produce an auditable receipt.
- **Vertical slice**: Implement and validate profile-governed extension event emission with controlled receipt recording, producing a versioned receipt and dashboard trace entry.
- **Validation approach**: Use an audit-first contract with a wired vertical slice: inventory existing extension and receipt seams, document gaps and API versions, add pure policy tests, and validate one end-to-end orchestrator-mediated operation.

## Acceptance Criteria

- Define typed `v1` API contracts for extension event emission, receipt recording, context retrieval, question handling, and knowledge lookup.
- Document the compatibility model: `v1` may evolve through additive optional fields, while breaking contract changes require a new versioned namespace.
- Ensure extensions interact through the orchestrator-mediated API boundary rather than directly owning or mutating Hepha workflow state.
- Define extension tool profiles that constrain the operations an extension may request or perform.
- Implement a deterministic pure policy helper that evaluates extension profile restrictions and approval requirements, returning allow, deny, or approval-required decisions.
- Ensure an orchestrator adapter enforces policy outcomes before executing controlled extension operations or recording their auditable effects.
- Record extension activity in receipts with sufficient contract version, operation, profile, policy decision, approval status, outcome, and correlation metadata for auditability.
- Expose versioned extension activity through dashboard traces or their underlying trace projection.
- Inventory the existing extension, orchestration, receipt, and trace seams before implementation and document the API gaps addressed by this feature.
- Add pure policy tests covering profile enforcement, approval handling, and receipt-producing decisions.
- Implement and validate one wired vertical slice in which a profile-governed extension event request passes through the orchestrator, applies policy controls, records a versioned receipt, and produces a dashboard trace entry.

## Validation

- Confirm the `v1` namespace and additive-evolution rules are explicit, typed, and sufficient for compatible contract changes; confirm breaking changes require a new major version.
- Verify that policy tests demonstrate extensions cannot bypass tool-profile restrictions or required approvals.
- Verify that the policy helper produces deterministic allow, deny, and approval-required decisions and that the orchestrator adapter enforces each outcome.
- Verify the event-emission vertical slice demonstrates the complete mediated path from extension request through orchestrator decision to versioned receipt and dashboard trace visibility.
- Review the seam inventory and documented gaps to confirm the implemented contract aligns with existing Hepha extension, orchestration, receipt, and trace architecture.
