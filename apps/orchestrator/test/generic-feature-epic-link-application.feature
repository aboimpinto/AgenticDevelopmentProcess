Feature: Generic feature-to-group relationship application
  A relationship mutation is reported together with scanner-visible and aggregate synchronization evidence.

  Scenario: Relationship mutation is visible after rescan
    Given an arbitrary work item is linked to an arbitrary parent group
    When the relationship application rescans durable documents
    Then the response reports the changed files and affected identities
    And scanner verification confirms both directions of the relationship

  Scenario: Scanner projection does not match the mutation
    Given a relationship mutation succeeds
    But the rescanned work item does not expose the expected parent
    When the response is assembled
    Then a scanner consistency warning is returned

  Scenario: Aggregate progress synchronization fails
    Given a relationship mutation affects a parent group
    When parent progress synchronization fails
    Then the mutation response remains available
    And the affected parent records the synchronization warning
