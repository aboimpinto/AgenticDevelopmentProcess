Feature: Acceptance-aware test delivery
  Test delivery separates human workflows from automated and deferred evidence.

  Scenario: Backend-only criteria need no manual package
    Given every acceptance criterion has automated evidence and no human-operable surface
    When Hepha builds the test delivery
    Then every criterion is classified as Automated
    And manual testing is Not Applicable
    And no manual case is fabricated

  Scenario: A concrete human workflow produces a ready package
    Given a manual criterion has a named application, exact preconditions, test data, actions, and observable results
    When Hepha validates the test delivery
    Then that criterion alone produces a manual case
    And the manual test package is ready

  Scenario: Mixed criteria preserve their verification methods
    Given one criterion has a concrete human workflow and another has automated evidence
    When Hepha builds the test delivery
    Then only the manual criterion becomes a manual case
    And the automated criterion points to automated evidence

  Scenario: Placeholder workflows are rejected
    Given every proposed manual case contains generic unresolved instructions
    When Hepha validates the test delivery
    Then no manual case is published
    And the manual test package is incomplete rather than ready
