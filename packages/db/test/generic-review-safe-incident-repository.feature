Feature: Generic safe review incident persistence
  Operational failures retain secret-safe metadata without leaking storage details.

  Scenario: A complete safe incident is appended
    Given validated incident metadata with optional review scope
    When the safe-incident repository records it
    Then the exact safe projection is stored once

  Scenario: Minimal safe metadata is accepted
    Given incident identity, project identity, stage, code, and a UTC timestamp
    When the safe-incident boundary validates it
    Then optional review scope may remain absent

  Scenario: Unsafe or malformed metadata is rejected before SQL
    Given incident metadata contains an unknown field, invalid value, or secret-like assignment
    When the safe-incident boundary validates it
    Then deterministic invalid input is returned

  Scenario: Storage failures do not expose database details
    Given an incident identity already exists or the database is unavailable
    When the repository attempts to append the incident
    Then deterministic persistence failure is returned
