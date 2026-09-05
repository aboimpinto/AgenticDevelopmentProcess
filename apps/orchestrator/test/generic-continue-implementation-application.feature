Feature: Generic Continue Implementation boundary
  Scenario: An in-progress feature continues
    Given declared phases, readiness, branch, receipt, and current context
    When implementation continuation is requested
    Then running state is durable before asynchronous execution

  Scenario: Source changes do not reopen Deep-Dive
    Given the feature has no unresolved validation markers
    When implementation continuation is requested after source files changed
    Then continuation starts without a source-hash recovery session

  Scenario: No implementation phase exists
    Given refinement artifacts contain no numbered or human-review phase
    When implementation continuation is requested
    Then continuation is denied before readiness and workflow state

  Scenario: Context became stale
    Given persisted context differs from current project content
    When implementation continuation is requested
    Then continuation is denied before workflow state is recorded
