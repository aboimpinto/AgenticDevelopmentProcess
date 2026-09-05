Feature: Generic interactive implementation handoff
  Scenario: A new implementation is handed to a worker
    Given a current work item and a non-autonomous implementation request
    When the interactive handoff is prepared
    Then progress is recorded before the implementation worker starts

  Scenario: An implementation continuation is handed to a worker
    Given a current work item with durable implementation progress
    When the interactive continuation handoff is prepared
    Then the continuation prompt and progress step are used

  Scenario: The implementation worker rejects the handoff
    Given a recorded interactive implementation handoff
    When the implementation worker fails
    Then the worker failure remains authoritative
