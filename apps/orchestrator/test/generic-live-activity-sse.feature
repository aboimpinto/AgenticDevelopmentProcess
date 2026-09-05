Feature: Generic live activity SSE delivery
  Project subscribers receive current activity and optional durable phase replay without affecting workflow execution.

  Scenario: A project event maps to live activity
    Given a live activity subscriber is connected for a project
    When a mapped workflow notification occurs
    Then the subscriber receives a best-effort live activity event

  Scenario: A subscriber reconnects with a phase cursor
    Given durable phase lifecycle events exist after the supplied cursor
    When the live activity stream reconnects
    Then those events are delivered as one replay batch before new broadcasts

  Scenario: Durable replay is unavailable
    Given the phase lifecycle store cannot answer a replay query
    When a subscriber reconnects with a cursor
    Then a replay-unavailable event explains that the dashboard can refresh manually
