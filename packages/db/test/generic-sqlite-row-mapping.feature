Feature: Generic SQLite row mapping
  SQLite rows must be converted into stable domain records before leaving persistence.

  Scenario: Map card and workflow rows
    Given SQLite returned card, finding, phase, task, and agent rows
    When the persistence adapter maps the rows
    Then camel-case records and normalized timestamps are returned

  Scenario: Map telemetry rows
    Given SQLite returned invocation, event, and lifecycle rows
    When the telemetry mappers run
    Then boolean, nullable, and timestamp values use the public record contracts

  Scenario: Map delivery and review rows
    Given SQLite returned transition, review, and verification rows
    When their bounded mappers run
    Then evidence fields retain their stored correlation

  Scenario: Map manual verification rows
    Given SQLite returned pack, review, and result rows
    When the manual-test mappers run
    Then the verification records retain their lifecycle states
