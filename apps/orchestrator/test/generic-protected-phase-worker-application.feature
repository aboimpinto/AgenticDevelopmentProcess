Feature: Generic protected phase worker execution
  Every phase worker runs behind test-coverage and machine-owned-state restoration boundaries.

  Scenario: Worker completes normally
    Given test coverage and machine-owned workflow state were captured before dispatch
    When the phase worker returns output
    Then coverage preservation is enforced
    And machine-owned state is restored before the output is accepted

  Scenario: Worker throws an error
    Given a phase worker mutates protected state before failing
    When its error is captured
    Then coverage and machine-owned state are restored first
    And the original worker error is propagated afterward

  Scenario: Protected state was changed
    Given restoration changes one or more machine-owned documents
    When protected execution completes
    Then workflow progress records the exact restored paths
    And the agent's mutation never becomes workflow authority
