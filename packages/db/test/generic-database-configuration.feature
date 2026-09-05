Feature: Generic database configuration and bootstrap
  Storage configuration is resolved before persistence adapters or project startup use it.

  Scenario: Explicit SQLite configuration takes precedence
    Given both a metadata path and a compatible database URL are configured
    When the storage path is resolved
    Then the explicit metadata path is selected

  Scenario: A PostgreSQL URL cannot become a SQLite filename
    Given a PostgreSQL connection URL is present
    When the SQLite fallback path is resolved
    Then the local fallback path is selected

  Scenario: Project startup reuses an existing PostgreSQL database
    Given the target database already exists
    When project startup checks its maintenance connection
    Then no database creation statement is issued

  Scenario: Concurrent PostgreSQL creation is recoverable
    Given two startup processes discover a missing database
    When another process creates it first
    Then duplicate-database evidence is accepted and the connection is closed
