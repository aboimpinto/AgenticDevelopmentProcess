Feature: Generic agent runtime composition
  All workflow agents share one model, process, console, and execution graph.

  Scenario: A workflow launches a one-shot agent
    Given a workflow selected a configured model
    When it submits a bounded prompt
    Then the shared process registry tracks the invocation
    And the workflow console can present its output

  Scenario: A phase launches an implementation worker
    Given a declared phase task is ready
    When the shared implementation worker executes it
    Then model routing and session naming use the common runtime
    And execution evidence is recorded through the metadata port

  Scenario: A completion worker runs detached
    Given completion work may outlive an HTTP request
    When the detached runner launches the worker
    Then it uses the shared process registry and model catalog
    And the task remains observable through its runtime boundary
