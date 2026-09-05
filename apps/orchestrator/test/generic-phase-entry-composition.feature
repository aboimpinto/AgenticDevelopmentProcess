Feature: Generic phase entry composition

  Scenario: Any phase begins from its durable state
    Given a selected phase and its current execution contract
    When Hepha prepares the phase entry
    Then template, task, review, and reconciliation services share one state graph

  Scenario: Any worker returns control to Hepha
    Given a protected phase worker has produced an outcome
    When Hepha reconciles continuation
    Then machine state, test coverage, blockers, and durable evidence are evaluated by shared services
