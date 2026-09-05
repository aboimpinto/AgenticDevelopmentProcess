Feature: Generic authoritative remediation successor handoff
  Remediation output is bound to its immutable predecessor and exact response and receipt identities.

  Scenario: No authoritative predecessor exists
    Given an arbitrary phase is not in authoritative remediation
    When successor prompt policy is evaluated
    Then no successor artifact contract is added

  Scenario: An authoritative predecessor exists
    Given an arbitrary phase has an immutable remediation predecessor
    When successor prompt policy is evaluated
    Then exact lifecycle findings, scope, response, and receipt identities are required
    And audit-only findings are excluded
