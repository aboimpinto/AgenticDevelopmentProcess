Feature: Generic phase implementation prompt composition
  The orchestrator binds arbitrary runtime context to independently owned phase policies without inferring behavior from names.

  Scenario: A contracted phase starts from a selected task
    Given an arbitrary phase contract and an orchestrator-selected task
    When the implementation prompt is composed
    Then the exact contract role, task identity, branch, agent, and model are present
    And behavior is not inferred from the phase title

  Scenario: A legacy phase has no execution contract
    Given an arbitrary legacy phase document
    When the implementation prompt is composed
    Then its explicit document tasks and gates remain authoritative
    And no fixed phase suffix or workflow identity is required

  Scenario: A worker reaches final evidence
    Given preparation, review remediation, and resilient recovery policies were composed
    When the worker reports its result
    Then the exact gate handoff precedes the concise implementation summary
    And durable phase advancement remains owned by the orchestrator
