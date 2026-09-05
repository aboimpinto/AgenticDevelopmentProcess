Feature: Generic phase exit application
  A later item may start only after the active item has durable completion evidence and every required authority is settled.

  Scenario: Declared work authorizes terminal transition
    Given an arbitrarily named item has exhausted every declared task
    And no review authority is required
    When the production phase exit application runs
    Then it records a passing checkpoint, marks the item complete, and refreshes durable state

  Scenario: Missing durable evidence fails closed
    Given a declared task or required quality gate remains unresolved
    When the production phase exit application runs
    Then it records a blocked checkpoint and does not mark the item complete

  Scenario: Generic evidence cannot replace authoritative review
    Given an item requires an exact persisted review receipt
    And the receipt or its store is unavailable
    When the production phase exit application runs
    Then it denies the transition with the authoritative review gate sentinel
