Feature: Generic protected phase worker execution
  A phase worker must receive scoped context and run behind workflow-state and coverage protection.

  Scenario: Ordinary implementation worker runs
    Given the current phase selects an implementation task
    When scoped context and the phase prompt are prepared
    Then one protected implementation worker returns output and coverage evidence

  Scenario: Planning worker runs
    Given the phase contract declares the planning role
    When its worker is launched
    Then the worker receives the planning agent role

  Scenario: Review findings worker runs
    Given current durable review findings require a fixer
    When the worker is launched with a leased successor identity
    Then fixer context and that successor handoff are preserved through protected execution
