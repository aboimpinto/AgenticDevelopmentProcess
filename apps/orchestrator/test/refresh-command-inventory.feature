Feature: Refresh maintains project-owned verification commands
  Scenario: Correct commands before taking the execution baseline
    Given a feature documents an obsolete command
    And its configured runner preserves the required behavior
    When the user explicitly refreshes completion readiness
    Then inspection proposes the corrected command with configuration evidence
    And HEPHA updates the TestPlan and Phase references before taking the baseline
    And the corrected checks execute with native reports
    And acceptance criteria, gate flags and saved human results are unchanged

  Scenario: Repeat Refresh reuses current configuration without replaying old edits
    Given a command correction has already been published
    When the user refreshes the unchanged feature again
    Then the admitted inventory stays unchanged
    And the previous literal replacement is not reapplied
    And fresh checks execute again

  Scenario: A proposed gate waiver cannot become a command correction
    Given a reconciliation response attempts to disable required tests
    When HEPHA validates the proposed document changes
    Then no document is changed
    And no test or completion action is dispatched
