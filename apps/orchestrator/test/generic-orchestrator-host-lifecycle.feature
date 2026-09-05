Feature: Generic orchestrator host lifecycle

  Scenario: Enabled metadata persistence is reported
    Given the configured metadata store is enabled
    When the host creates its runtime services
    Then the SQLite database location is reported once

  Scenario: Disabled metadata persistence remains quiet
    Given the configured metadata store is disabled
    When the host creates its runtime services
    Then no SQLite availability message is reported

  Scenario: One project startup failure does not block other projects
    Given multiple registered projects require startup preparation
    And one project preparation fails
    When the host prepares all registered projects
    Then the failure is reported for that project
    And preparation continues with the remaining projects
