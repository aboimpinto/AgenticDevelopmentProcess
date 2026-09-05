Feature: Generic feature workflow presentation
  Workflow state is presented consistently without changing execution decisions.

  Scenario: Active workflow progress follows the declared workflow definition
    Given a workflow definition with ordered nodes
    When the active node is projected
    Then earlier nodes are complete, the active node is running, and later nodes are pending

  Scenario: Terminal work closes preparation actions
    Given a completed work item with stale running metadata
    When its workflow message is projected
    Then the terminal lifecycle message takes precedence

  Scenario: Missing quality evidence remains recoverable
    Given implementation is complete with missing quality evidence
    When its workflow message is projected
    Then continuation is presented as the recovery action

  Scenario: Unavailable workflow definitions do not break the work-item query
    Given the workflow definition cannot be loaded
    When progress is projected
    Then no progress projection is returned
