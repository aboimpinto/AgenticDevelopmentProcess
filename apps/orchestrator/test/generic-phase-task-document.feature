Feature: Generic phase task document persistence
  A phase document is the durable plan while operational task runs are its projected execution evidence.

  Scenario: A resolved task is persisted without depending on a phase name
    Given an arbitrarily named phase has two declared ledger items
    When the production document repository completes the selected item and projects its stored run
    Then only that item's checkbox is checked
    And the task-state section records its lifecycle timestamps and duration
    And repeating the projection does not duplicate the task-state section
