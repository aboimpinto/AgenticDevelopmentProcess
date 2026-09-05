Feature: Generic authoritative phase review invocation planning
  A review gate is bound to exact durable scope, storage, and immutable invocation identity before execution.

  Scenario: Baseline review is ready
    Given preceding phase work is durably complete
    And baseline review is required
    When the review invocation is planned
    Then one independent reviewer invocation is dispatched
    And its artifact identity and scope are fixed before model execution

  Scenario: Remediation requests a rerun
    Given a durable fixer handoff requires independent review
    When the review invocation is planned
    Then one rerun invocation is dispatched with the same phase scope

  Scenario: A terminal decision already exists
    Given the authoritative review state is approved or blocked
    When the review invocation is planned
    Then no reviewer invocation is dispatched

  Scenario: Durable approval can authorize exit
    Given an approved manifest was read from authoritative storage
    When the review invocation is planned
    Then its exact scope, hash, and database form the phase-exit receipt
