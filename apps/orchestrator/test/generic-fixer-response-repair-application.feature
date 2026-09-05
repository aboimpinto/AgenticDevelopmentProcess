Feature: Generic bounded Fixer Response repair
  A successful fixer return reopens independent review only after every required immutable response entry is complete.

  Scenario: Required responses are missing
    Given the latest authoritative review report lacks one or more required Fixer Response entries
    When bounded response repair runs
    Then the repair worker receives only the confirmed missing finding identities
    And the report is revalidated before independent review is reopened

  Scenario: Required responses are complete
    Given every blocking or required finding has a complete Fixer Response
    When response repair evaluates the report
    Then no repair worker is launched
    And the phase is marked ready for an independent review rerun

  Scenario: Repair cannot converge safely
    Given missing responses remain after the configured repair budget or the report disappears
    When response repair continues
    Then the phase fails closed with exact diagnostic evidence
    And no incomplete response authorizes a review rerun
