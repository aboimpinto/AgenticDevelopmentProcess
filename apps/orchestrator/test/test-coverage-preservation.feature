Feature: Generic phase repair preserves executable coverage
  A validation repair may correct fixtures, selectors, configuration, tests, or
  production code, but it cannot manufacture a green gate by weakening tests.

  Scenario: Existing test cases survive a repair
    Given a phase begins with named executable test cases
    When a repair worker changes test infrastructure
    Then every existing test case remains present
    And the existing assertion count does not decrease

  Scenario: Coverage reduction is restored and denied
    Given a phase begins with named executable test cases
    When a repair worker deletes a case or strips assertions
    Then the generic phase executor restores the prior test artifact
    And the active task does not complete
    And the same phase is dispatched again in the same workflow run

  Scenario: A failed validation retries the active phase
    Given a phase contract uses the repair and rerun failure policy
    When the worker reports a failed test or Gherkin gate
    Then the active task remains in progress
    And the failure evidence is sent to the next worker
    And the same phase is dispatched again in the same workflow run
