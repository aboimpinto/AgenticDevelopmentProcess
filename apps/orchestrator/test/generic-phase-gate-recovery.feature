Feature: Generic phase gate recovery
  Interrupted worker evidence may repair machine-owned gate rows only after durable task and missing-gate preconditions agree.

  Scenario: Exact persisted evidence repairs an interrupted phase handoff
    Given an arbitrarily named phase has checked durable work and missing worker-owned gates
    And the exact-bound persisted session contains a complete handoff
    When the production gate recovery application runs
    Then changed files and test decisions are updated from that handoff
    And the work item is refreshed after the document mutation
