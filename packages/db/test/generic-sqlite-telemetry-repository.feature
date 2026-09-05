Feature: Generic SQLite execution telemetry repository
  Agent runs, normalized events, and lifecycle activity persist behind one evidence boundary.

  Scenario: Agent invocation updates preserve one durable run record
    Given an agent invocation has started
    When the same invocation later finishes
    Then status, completion, duration, and update evidence replace the running projection

  Scenario: Invocation history supports bounded operational queries
    Given invocation evidence exists across workflow contexts
    When the timeline is filtered and paginated
    Then matching invocations are returned in start-time order

  Scenario: Normalized events preserve a queryable execution timeline
    Given agent runtime events were normalized
    When events are filtered by context, type, and time
    Then matching event evidence is returned in timestamp order

  Scenario: Live lifecycle polling resumes strictly after its cursor
    Given ordered lifecycle events exist for a project
    When activity is requested after a known event
    Then only later events are returned in deterministic order
