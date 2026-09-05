Feature: Generic phase execution safety
  An implementation worker follows project constraints, repairs owned failures, and returns durable evidence without weakening coverage.

  Scenario: A configured full-profile check fails
    Given an arbitrary phase owns full validation
    When a configured build, typecheck, lint, or test check fails
    Then the worker repairs the responsible contract and reruns the configured profile
    And the phase does not complete while that check remains red

  Scenario: A repair exposes existing executable coverage
    Given an arbitrary phase must repair a validation failure
    When the worker changes production code, tests, fixtures, or configuration
    Then every existing executable scenario title and assertion is preserved
    And the worker returns the exact gate evidence handoff

  Scenario: A review remediation is narrowly scoped
    Given an arbitrary phase is resolving review findings
    When a local check exposes an unrelated issue
    Then the worker does not broaden the review recovery scope
    And it does not start a server or push to a remote
