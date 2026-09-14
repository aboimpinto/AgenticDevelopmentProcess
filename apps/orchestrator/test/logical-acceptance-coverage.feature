Feature: Logical acceptance coverage with separate assessment and repair authority
  Scenario Outline: Existing integration assertions satisfy behavior without numeric instrumentation
    Given an accepted phase named <identity> maps the saved-draft criterion to an existing integration test
    And the test saves through the application and asserts the persisted result after reload
    And the configured test execution passed without an LCOV or percentage report
    When readiness receives the prior logical assessment and current assertion source
    Then the existing behavior can be recognized without creating another test
    And changed assertions invalidate the assessment context without resetting manual results
    And readiness cannot create tests, fix product code or grant human acceptance
    Examples:
      | identity       |
      | phase-alpha.md |
      | phase-38.md    |

  Scenario: Numeric tooling is optional at a final checkpoint
    Given configured build, test and lint checks and no numeric coverage command
    When the project verification profile is validated
    Then absence of numeric instrumentation is not a missing required intent
    And phase acceptance still requires meaningful logical assessment and applicable test execution

  Scenario: A real assertion gap belongs to the phase fixer
    Given current assertions do not establish a required acceptance behavior
    When Refresh Readiness assesses them
    Then it reports the exact unproved behavior and inspected sources
    And an explicitly requested phase fixer may correct that finding and rerun affected checks
    But Refresh Readiness itself cannot change tests or product code

  Scenario: Existing legacy tests need no new phase artifact
    Given a feature has no structured phase gate record
    And its current inspected verification plan references an existing integration test file
    When readiness builds logical assessment context
    Then the current test body and inspected assertion summary are available
    And no source or gate artifact is created
