Feature: Generic declared-verification repair prompt
  A failed active verification task receives exact configured evidence and remains under executor control.

  Scenario: One or more configured checks fail
    Given an arbitrary active verification task has ordered failed check evidence
    When its repair prompt is composed
    Then each intent, command, outcome, and output is preserved
    And the worker repairs the responsible production or verification artifact

  Scenario: A repair is possible
    Given focused work can correct the configured verification failure
    When the repair worker returns repaired evidence
    Then the executor reruns the complete declared profile
    And only the executor may complete the task

  Scenario: A genuine external blocker prevents repair
    Given repair requires credentials, unsafe action, or a human decision
    When the repair worker reports the explicit blocked result
    Then the task remains in progress
    And the blocker is returned without a fixed retry cap
