Feature: Generic human review findings phase execution
  A declared human-review phase remains a normal durable phase with an explicit user handoff.

  Scenario: Findings are ready for user acceptance
    Given an arbitrary human-review phase contains open findings
    When its findings worker records complete evidence
    And the refreshed phase awaits user acceptance
    Then the workflow returns the worker summary

  Scenario: The worker leaves no valid handoff state
    Given an arbitrary human-review phase contains open findings
    When its worker returns without awaiting the user or completing the phase
    Then phase execution is denied

  Scenario: Durable finding evidence is incomplete
    Given an arbitrary human-review phase has a valid status
    When its required finding evidence remains incomplete
    Then phase execution is denied
