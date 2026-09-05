Feature: Generic review remediation lifecycle projection

  Background:
    Given an arbitrary phase has an immutable review manifest
    And the phase executor has no feature, phase-number, task, or finding-name exception

  Scenario: A settled observation accompanies an open blocker
    Given the manifest contains one audit-only observation
    And the manifest contains one in-scope blocker with remediation work
    When the generic phase executor builds the fixer handoff
    Then the blocker is required in the remediation response and receipt
    And the observation remains immutable audit evidence
    But the observation is absent from all response and receipt arrays

  Scenario: A scope expansion owns remediation lifecycle evidence
    Given the manifest contains one scope-expansion finding with remediation work
    When the generic phase executor builds the fixer handoff
    Then the scope-expansion finding is required in the remediation response and receipt
