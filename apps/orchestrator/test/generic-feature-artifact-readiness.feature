Feature: Generic feature artifact readiness
  Workflow transitions validate the durable artifacts owned by their completed operation.

  Scenario: Design work omits or empties required evidence
    Given the design operation has returned
    When its required artifacts are validated
    Then every missing or empty design artifact is reported together

  Scenario: Refinement readiness is checked during implementation
    Given a refined work item is already in progress
    When refinement completeness is projected
    Then execution-contract artifact validation is used

  Scenario: Start post-processing records estimates
    Given every non-skipped phase has human and AI estimates
    And the task ledger has an implementation timing summary
    When timing readiness is validated
    Then the start transition may continue

  Scenario: A skipped phase has no estimate
    Given a phase is explicitly skipped
    When timing readiness is validated
    Then that phase does not require implementation estimates
