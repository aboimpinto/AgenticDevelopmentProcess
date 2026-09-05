# FEAT-066: Defect Class Replan Workflow And Approval Governance

**Feature ID**: FEAT-066  
**Parent Epic**: EPIC-013  
**Status**: Completed  
**Priority**: P1  

## Summary

Define the smallest complete governance flow for review defects: classify a defect deterministically, create a replan proposal, require an authorized approval decision, and block execution or invalid workflow transitions until that decision is recorded.

## Source

- EPIC: EPIC-013 - Deterministic Review Remediation And Architecture Debt Governance
- Created by Hepha unnamed FEAT discovery from the current EPIC document.

## Hepha Deep-Dive Decisions

- The primary acceptance contract is to classify defects, produce a replan proposal, and require authorized approval before execution can continue.
- Refinement will use an end-to-end governance slice covering defect classification, replan artifact creation, approval request and decision recording, and prevention of invalid state transitions.
- V1 recognizes three deterministic semantic defect classes:
  - **Contract defect**: a discrepancy between required or agreed behaviour, interface, acceptance criteria, or externally relied-on workflow contract and the reviewed result.
  - **Implementation defect**: an error in implementing an otherwise valid and sufficiently defined contract, without requiring a change to the governing architecture or contract.
  - **Architecture debt**: a structural, cross-cutting, maintainability, reliability, or technical-direction concern that requires an intentional architectural remediation decision.
- Each defect class has explicit classification rules and required replan context.
- Approval authority is determined through a class-based role policy that maps each defect class to authorized approval roles.
- A replan proposal author must not approve or reject their own proposal.
- Hepha owns the authoritative persisted records for validated classification, replan proposal, approval request, approval decision, and lifecycle state events.
- Hepha produces a readable replan artifact from its authoritative records.
- A centralized execution gate must be enforced at every remediation execution and workflow-transition entry point.

## Defect Classification And Replan Requirements

| Defect class | Classification basis | Required replan context |
| --- | --- | --- |
| Contract defect | The reviewed result violates an established requirement, interface, acceptance criterion, or workflow contract. | Affected contract, evidence of the discrepancy, scope of the required correction, impacted consumers or workflow states, and validation approach. |
| Implementation defect | The contract remains valid, but the implementation does not correctly satisfy it. | Affected implementation area, evidence of the defect, correction scope, regression risk, and verification approach. |
| Architecture debt | The review identifies a structural or technical-direction concern requiring deliberate architectural remediation. | Architectural concern, affected boundaries or components, rationale and consequences of remediation, alternatives or trade-offs where applicable, migration or sequencing needs, and validation approach. |

## Approval Governance

- A validated defect classification selects the applicable class-based approval policy.
- The policy identifies the roles authorized to approve or reject proposals for that defect class.
- The approval request records the selected policy context, eligible approval roles, proposal author, proposal version, and requested decision.
- The system rejects an approval or rejection decision from an actor who is not authorized by the selected class policy.
- The system rejects an approval or rejection decision from the proposal author.
- Approval decisions are recorded with the deciding actor, authorized role basis, decision, timestamp, applicable proposal version, and optional decision rationale.
- A rejected proposal remains unavailable for remediation execution until a revised proposal follows the applicable request and decision flow.

## Lifecycle And Execution Gate

1. A review defect is recorded and classified as contract defect, implementation defect, or architecture debt.
2. Hepha validates the classification and required class-specific replan context.
3. A replan proposal is created as a Hepha-owned record and rendered as a readable artifact.
4. Hepha creates an approval request using the approval policy applicable to the selected defect class.
5. The proposal remains blocked while approval is pending.
6. An authorized, non-author actor records an approval or rejection decision.
7. Only an approved proposal version may permit its associated remediation execution and permitted downstream workflow transitions.
8. Rejection, supersession, missing approval, invalid authorization, or an invalid lifecycle state prevents remediation execution and relevant workflow progression.

## Acceptance Criteria

- The workflow classifies review defects deterministically as contract defect, implementation defect, or architecture debt using explicit classification rules.
- A classified defect produces a replan proposal artifact containing the required remediation and class-specific workflow context.
- Hepha persists validated classification, proposal, approval request, approval decision, and lifecycle state events as authoritative records.
- The workflow creates an approval request for each applicable replan proposal using the class-based role policy.
- The class-based policy maps each defect class to authorized approval roles.
- The system records an authorized approval or rejection decision, including the decision actor, authorization basis, proposal version, timestamp, and decision outcome.
- The system prevents a proposal author from approving or rejecting their own proposal.
- The system rejects approval decisions from actors not authorized for the classified defect class.
- Execution remains blocked until an authorized approval decision is recorded for the applicable replan proposal version.
- Rejected, superseded, pending, or otherwise invalid proposals cannot authorize remediation execution.
- A centralized guard prevents invalid remediation execution and workflow transitions at every applicable execution and transition entry point.
- The system prevents invalid state transitions, including progressing blocked remediation without approval or applying a decision outside the allowed lifecycle state.
- The complete producer-to-consumer flow is auditable from review defect classification through replan creation, approval request, decision recording, and resulting workflow state.

## Validation

- Validate the end-to-end governance slice during refinement, design, and implementation planning.
- Define the concrete class-to-role approval policy and its source of authority.
- Define the authoritative record schema, readable artifact format, lifecycle states, proposal versioning rules, and centralized guard integration points.
- Verify authorization, self-approval prevention, pending approval blocking, rejection handling, and invalid-transition prevention through automated state-transition and command-result tests.
