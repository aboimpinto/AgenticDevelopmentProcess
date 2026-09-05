Feature: Generic phase review state resolution
  Review routing must use current phase, report, and exact-scope immutable evidence rather than workflow prose.

  Scenario: A phase reaches its baseline review gate
    Given its declared work is ready for independent review
    When no newer immutable decision exists
    Then the review resume planner selects the reviewer from current phase facts

  Scenario: A previous failure references review findings
    Given a compact failure brief identifies the active phase
    When the latest report still requires changes
    Then the failure is supplied only as a fixer-routing fact

  Scenario: Immutable approval survives a restart
    Given the exact review scope has a current approved manifest
    When the workflow resumes without transient state
    Then the phase resume planner receives that authoritative approval

  Scenario: Canonical feature identity is unavailable
    Given a feature cannot be mapped to an immutable review scope
    When review state is resolved
    Then authoritative storage is not queried with an invented identity
