Feature: Generic authoritative remediation successor preparation
  A fixer receives exact immutable response and receipt identities only when an authoritative predecessor requires remediation.

  Scenario: Fixer cycle has an authoritative predecessor
    Given the current phase is resolving findings from an immutable review manifest
    When the remediation successor handoff is prepared
    Then exact response and receipt identities are leased
    And the prompt handoff contains the predecessor, scope, storage path, and remediation finding projection

  Scenario: Current task is not an authoritative fixer cycle
    Given implementation is not resolving authoritative review findings
    When remediation successor preparation runs
    Then any previous identity lease is cleared
    And no lineage lookup or successor allocation occurs

  Scenario: Required predecessor is unavailable
    Given authoritative remediation requires an exact predecessor
    When that predecessor cannot be read from durable storage
    Then successor preparation fails closed
    And no response or receipt identity is allocated
