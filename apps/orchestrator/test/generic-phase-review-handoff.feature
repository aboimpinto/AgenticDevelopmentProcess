Feature: Generic phase review handoff
  A declared review task starts only after earlier durable work is ready and the review gate remains unresolved.

  Scenario: The first eligible contract-ordered item enters independent review
    Given arbitrarily named work items are supplied in execution-contract order
    And the first item has settled work, requires review, and has no unresolved review authority
    When the production review handoff application runs
    Then only that item is marked as awaiting independent review
    And the refreshed work item is returned

  Scenario: Existing findings retain authority
    Given an eligible item has a latest review that needs changes
    When the production review handoff application runs
    Then no baseline review handoff replaces the fixer and reviewer circuit
