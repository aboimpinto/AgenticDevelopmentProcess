Feature: Generic workflow telemetry contracts
  Runtime, persistence, APIs, and presentation share stable observability records.

  Scenario: An agent event is normalized and stored
    Given a raw runtime event has lifecycle context
    When it is normalized and attached to an invocation
    Then the event identity and invocation evidence remain correlated

  Scenario: Project activity is streamed
    Given a project lifecycle event is emitted
    When a client receives or replays live activity
    Then its cursor, summary, and replay capability remain stable

  Scenario: Execution evidence is presented
    Given invocation and event records exist for a run
    When trace and metrics projections are assembled
    Then chronological evidence and aggregate measurements remain read-only

  Scenario: A receipt is inspected
    Given a workflow receipt and its invocation ledger exist
    When receipt search or detail is requested
    Then safe artifact links and knowledge rules are preserved
