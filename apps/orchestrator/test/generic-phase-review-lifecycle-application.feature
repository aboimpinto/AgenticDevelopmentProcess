Feature: Generic authoritative phase review lifecycle
  One independent review crosses execution, bounded representation repair, and immutable publication before workflow routing.

  Scenario: Valid review is published
    Given a phase reaches any declared independent-review task
    When the reviewer returns a contract-valid decision
    Then the review is published through the authoritative store
    And the persisted route is returned to the phase workflow

  Scenario: Review representation is repaired
    Given the independent review decision has a repairable contract representation
    When bounded repair produces a valid representation
    Then the unchanged decision is published
    And both repair and publication summaries are retained

  Scenario: Review representation remains invalid
    Given bounded contract repair cannot produce a valid representation
    When the review lifecycle evaluates the final rejection
    Then blocked progress is recorded with the rejection code
    And no invalid artifact is published
