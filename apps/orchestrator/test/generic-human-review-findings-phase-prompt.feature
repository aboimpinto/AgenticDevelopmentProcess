Feature: Generic continuation of a human-review findings phase
  All post-implementation findings remain ordered in one durable phase document.

  Scenario: Several open findings need work
    Given an arbitrary findings phase contains multiple open observations
    When its continuation prompt is composed
    Then every observation retains a task checklist and configured evidence
    And no second findings phase is created

  Scenario: Repairs are ready for human verification
    Given every open finding has complete agent work and recorded evidence
    When the findings phase is continued
    Then it may wait for user acceptance
    And the agent cannot mark user findings solved

  Scenario: Every finding has already been solved by the user
    Given durable user decisions resolve every finding
    When the findings phase is continued
    Then completion remains an allowed result
    And the existing phase document remains the source of truth
