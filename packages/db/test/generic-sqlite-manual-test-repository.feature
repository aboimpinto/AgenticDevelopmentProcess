Feature: Generic SQLite manual-test evidence repository
  Manual verification packs, reviews, and results persist behind one bounded repository.

  Scenario: A current verification pack is available
    Given a verification pack was recorded
    When the current pack is requested
    Then its immutable artifact identity and current state are returned

  Scenario: A pack can be superseded
    Given a current verification pack exists
    When it is superseded by newer implementation evidence
    Then it is no longer returned as the current pack

  Scenario: A human review can be invalidated
    Given a human reviewed the current verification pack
    When implementation changes invalidate that review
    Then no current review is returned

  Scenario: Manual results are idempotent
    Given a result has already been recorded
    When the same result identity is submitted again
    Then one original result remains available in pack and card projections
