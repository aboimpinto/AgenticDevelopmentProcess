Feature: Generic agent task contracts
  Agent execution and HTTP transport share one stable task representation.

  Scenario: A task is created
    Given an agent, model, prompt, and title are supplied
    When the runtime creates an agent task
    Then its lifecycle, events, and presentation fields satisfy the shared contract

  Scenario: Tasks are listed
    Given zero or more agent tasks exist
    When the task collection is returned
    Then the response contains the same bounded task representations

  Scenario: A task event is reported
    Given an agent task changes lifecycle state
    When an event is appended
    Then its type, detail, time, and presentation tone are preserved
