Feature: Generic feature completion readiness
  Finalization starts only after implementation and user-owned evidence are resolved.

  Scenario: A fully resolved direct-delivery feature can finalize
    Given every implementation phase and quality gate is resolved
    And review, manual verification, and findings are closed
    When completion readiness is evaluated
    Then feature finalization can start

  Scenario: Any unresolved workflow evidence blocks finalization
    Given a phase, quality gate, user verification, finding, or Human Review phase remains unresolved
    When completion readiness is evaluated
    Then feature finalization cannot start

  Scenario: Pull-request delivery waits for its delivery lifecycle
    Given the feature uses pull-request delivery
    When completion readiness is evaluated
    Then direct Complete Feature finalization cannot start
