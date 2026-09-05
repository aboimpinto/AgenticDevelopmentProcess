Feature: Generic phase execution planning
  Each phase iteration derives its worker and review route from durable contract and repository facts.

  Scenario: Ordered implementation task is planned
    Given an arbitrary code phase has a next declared implementation task
    And production files changed in that phase
    When execution planning runs
    Then the task and changed files are supplied to review planning
    And the declared implementation worker is selected

  Scenario: Non-ordered phase has no declared task cursor
    Given an arbitrary phase does not use ordered task execution
    When execution planning runs
    Then no ordered task is projected

  Scenario: Review findings select the fixer
    Given durable review state contains unresolved findings
    When execution planning runs
    Then the fixer model is selected for the same phase

  Scenario: Conditional review task is skipped
    Given a declared conditional review task is not required
    When review planning durably skips that task
    Then the same phase is repeated before review state or worker routing is evaluated
