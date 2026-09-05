Feature: Generic review governance schema migration
  Immutable review evidence evolves through ordered and atomic database changes.

  Scenario: A new database receives every review schema version
    Given an empty review governance database
    When review persistence initializes its schema
    Then each numbered migration is applied in ascending order

  Scenario: Existing review evidence survives repeated initialization
    Given a current review governance database containing immutable evidence
    When schema initialization runs again
    Then existing evidence and migration timestamps remain unchanged

  Scenario: A schema change fails atomically
    Given an incompatible database prevents the next schema version
    When review persistence attempts that migration
    Then the version is not recorded and its partial schema changes are rolled back

  Scenario: The production store delegates schema ownership
    Given the review governance store opens a database
    When its schema is required
    Then the numbered migration module owns all review schema statements
