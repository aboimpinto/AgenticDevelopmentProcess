Feature: Execution evidence uses context instead of globally unique display names
  Scenario: Parameterized tests share a display name
    Given a configured runner executes several input cases under one displayed test name
    When HEPHA imports the checksum-bound native report
    Then every passing case remains individually addressable in that report
    And acceptance coverage must still be assessed against the TestPlan and actual assertions

  Scenario: Unit and integration assemblies share test names
    Given independent native reports contain identically named methods
    When HEPHA imports the selected check's reports
    Then each execution retains its report and native context
    And identical names do not prevent import

  Scenario: Display-name flexibility does not waive execution verification
    Given a report has a failed, skipped, missing or count-mismatched execution
    When HEPHA imports the report
    Then it cannot establish passing execution evidence
    And repeated report bytes or duplicate native execution IDs cannot inflate counts
