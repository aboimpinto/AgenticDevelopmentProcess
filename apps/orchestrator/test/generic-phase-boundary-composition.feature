Feature: Generic phase boundary composition
  Phase entry helpers and exit decisions share one identity-blind application graph.

  Scenario: A declared verification task reaches a clean boundary
    Given a phase declares a full verification task
    When all configured checks pass
    Then its projection is persisted
    And exit authorization evaluates the recorded evidence

  Scenario: A completed phase requires a Git checkpoint
    Given all declared implementation tasks are resolved
    When the phase contract requires a Git checkpoint
    Then the focused checkpoint runs before phase completion
    And the queue evaluates the next unresolved phase

  Scenario: A recoverable phase failure is recorded
    Given a worker fails outside a review-owned recovery circuit
    When failure recording evaluates the error
    Then durable phase progress records the failure
    And implementation completion remains unavailable
