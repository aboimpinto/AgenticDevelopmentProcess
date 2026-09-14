Feature: Resume report validation without repeating passing execution
  Scenario: Native stdout is also the audit log
    Given a passing native report and audit log refer to the same checksum-bound file
    When HEPHA validates the receipt
    Then its tests count once and both bindings must match the file
    And repeated native reports cannot inflate the test count

  Scenario: One check spans configured repositories
    Given a passing integration check includes configuration from two repositories
    And each revision has an explicit working-tree qualification
    When HEPHA validates either hash-first or working-tree-first wording
    Then the revisions must match the configured owners with the execution owner first
    And unbound or alternative hashes are rejected

  Scenario: Explicit refresh resumes interrupted validation
    Given a refresh stopped during report validation after its checks passed
    And all selected native reports and source snapshots still validate
    When the user refreshes completion readiness
    Then HEPHA resumes the same execution run and assesses accepted criteria
    And no inspection or test command runs again
    And existing human results and execution timestamps remain unchanged

  Scenario: Interrupted evidence is no longer current
    Given a refresh stopped during report validation
    And a source or report has changed or a required outcome is missing
    When the user refreshes completion readiness
    Then the old run cannot certify current readiness
    And HEPHA performs fresh verification
