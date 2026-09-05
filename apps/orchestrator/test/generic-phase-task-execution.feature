Feature: Generic phase task execution lifecycle
  The executor advances durable tasks one at a time and keeps recoverable failures on the current task.

  Scenario: A failed task is resumed and then completed
    Given an arbitrarily named phase has two unresolved ledger items
    When the production task executor claims the first item and records a recoverable failure
    Then the next execution claims that same item again
    When that item is completed
    Then its checkbox and stored run are completed
    And the following execution selects the second item
