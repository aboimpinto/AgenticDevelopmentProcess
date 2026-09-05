Feature: Generic SQLite card and preparation evidence repository
  Scanned card projections, preparation evidence, and deep-dive sessions share one bounded owner.

  Scenario: Card reconciliation is atomic
    Given several scanned work items form one reconciliation batch
    When any work item violates the durable card contract
    Then no partial batch is committed

  Scenario: Deep-dive sessions retain their full lifecycle
    Given a preparation conversation is active
    When its questions, connection, and completion state change
    Then the latest session is durable and no longer appears as open after completion

  Scenario: Refined source evidence preserves preparation identity
    Given deep-dive and interface-decision evidence exists
    When refinement confirms a newer source document
    Then source hashes and semantic content change without replacing the deep-dive run identity

  Scenario: Human verification timestamps are idempotent
    Given code review or manual testing was completed by a person
    When the same completion is recorded again
    Then the original completion timestamp remains authoritative
