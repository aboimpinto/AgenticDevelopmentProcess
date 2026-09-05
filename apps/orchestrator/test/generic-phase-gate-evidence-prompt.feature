Feature: Generic phase gate evidence prompt contract
  Workers report gate evidence while the orchestrator remains the only owner of durable workflow fields.

  Scenario: A worker reports successful evidence
    Given an arbitrary phase worker finishes declared work
    When it returns gate evidence
    Then changed files, tests, and executable behavior use the exact handoff rows
    And the worker does not edit machine-owned status or decision fields

  Scenario: A required check does not pass
    Given an arbitrary required check fails, times out, is skipped, or crashes
    When the worker returns gate evidence
    Then the result is failed
    And the task cannot complete

  Scenario: A gate table is updated by the orchestrator
    Given validated worker evidence exists
    When the orchestrator persists the evidence
    Then each gate occupies one physical three-column row
    And only canonical decision values are used
