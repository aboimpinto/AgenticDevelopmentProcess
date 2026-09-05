Feature: Generic independent phase review execution
  A ready review invocation receives scoped context and exact lineage before one independent reviewer runs.

  Scenario: Baseline review executes
    Given a phase first reaches its declared review gate
    When independent review executes
    Then scoped code-review context and the baseline manifest contract are provided
    And no predecessor lineage is invented

  Scenario: Remediation review executes
    Given a fixer produced an authoritative rerun handoff
    When independent review executes
    Then the exact persisted predecessor is included in the rerun manifest contract
    And the reviewer receives a fresh execution context

  Scenario: Rerun lineage is unavailable
    Given a rerun is required but its authoritative predecessor cannot be read
    When independent review execution is attempted
    Then blocked progress is recorded
    And no reviewer is dispatched

  Scenario: Reviewer execution completes
    Given exact scope, identity, lineage, policies, and context are available
    When the independent reviewer returns
    Then its raw output is passed unchanged to contract repair and publication
