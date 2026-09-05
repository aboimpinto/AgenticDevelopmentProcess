Feature: Generic SQLite metadata schema lifecycle
  Durable metadata tables evolve independently from repository query behavior.

  Scenario: A new database receives the complete schema
    Given an empty SQLite database
    When metadata persistence is used for the first time
    Then all required tables and indexes are created

  Scenario: Schema initialization is idempotent
    Given the current metadata schema already exists
    When initialization is requested again
    Then no table data or schema object is replaced

  Scenario: A compatible table receives a missing column
    Given an older table lacks a newly required metadata column
    When schema initialization runs
    Then the column is added without rebuilding unrelated tables

  Scenario: Legacy workflow constraints are migrated
    Given stored card metadata uses an older workflow constraint
    When schema initialization runs
    Then current workflow states are accepted and existing card data is preserved
