Feature: Generic Start Implementation boundary
  Scenario: A ready feature starts implementation
    Given valid refinement, readiness, and transition evidence
    When implementation startup is requested
    Then running state is durable before asynchronous execution

  Scenario: Refinement artifacts are invalid
    Given refinement validation reports contract errors
    When implementation startup is requested
    Then startup is denied before workflow state is recorded

  Scenario: Readiness is blocked
    Given a blocking readiness reason
    When implementation startup is requested
    Then startup is denied before transition authorization
