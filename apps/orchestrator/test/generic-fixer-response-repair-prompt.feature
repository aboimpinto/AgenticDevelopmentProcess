Feature: Generic constrained fixer-response repair
  A malformed reviewer-response contract can be repaired without reopening implementation or review scope.

  Scenario: Missing canonical responses are repaired
    Given an arbitrary review report has confirmed missing fixer response IDs
    When constrained response repair is requested
    Then only the named report and missing response entries may change
    And complete existing responses remain unchanged

  Scenario: Repair cannot become implementation
    Given an arbitrary response contract needs repair
    When the repair worker receives its contract
    Then source code, tests, phase documents, and findings remain immutable
    And no review rerun is performed
