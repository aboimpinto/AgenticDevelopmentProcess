Feature: Generic immutable review evidence queries
  Findings, observations, remediation, and verification evidence share one read-only repository.

  Scenario: Finding provenance remains complete
    Given findings exist for an immutable review run
    When findings and an observation context are read
    Then scope, rule, defect, disposition, and manifest provenance are returned

  Scenario: Remediation history is scope isolated
    Given observations and remediation cycles exist across review scopes
    When evidence is read for one run and exact scope
    Then only matching evidence is returned in deterministic order

  Scenario: Verification evidence remains immutable
    Given remediation item and verification receipt events exist
    When their review-run histories are listed
    Then complete stored events are returned oldest first

  Scenario: Evidence identities are validated before querying
    Given a malformed run, scope, or observation identity
    When an evidence repository read is attempted
    Then the request is rejected without deriving workflow decisions
