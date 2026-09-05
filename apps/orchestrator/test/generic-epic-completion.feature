Feature: Generic aggregate completion
  An aggregate completes only when every uniquely resolved linked work item is completed.

  Scenario: Completion is verified after synchronization
    Given an aggregate links only completed work items
    When the production aggregate completion application synchronizes its state
    Then the refreshed aggregate must report completed before success is returned

  Scenario: Ambiguous linked state blocks completion
    Given one linked identity appears in different lifecycle folders
    When aggregate completion is evaluated
    Then completion is rejected with the conflicting states
