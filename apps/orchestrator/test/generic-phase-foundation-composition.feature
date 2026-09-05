Feature: Generic phase foundation composition

  Scenario: A workflow starts any declared phase
    Given durable feature, task, contract, and evidence stores
    When Hepha composes the phase foundation
    Then one shared application graph owns task, contract, progress, gate, and planning state

  Scenario: A workflow resumes any declared phase
    Given prior durable phase state
    When Hepha resolves the next phase action
    Then every consumer uses the same composed foundation instances
