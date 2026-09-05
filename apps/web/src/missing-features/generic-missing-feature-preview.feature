Feature: Generic missing-child preview workflow
  Candidate discovery is previewed before durable child work items are created.

  Scenario: Preview binds discovery to the current parent
    Given a current project and parent work item
    When missing children are previewed
    Then the server-authored plan and visible items are reconciled

  Scenario: Apply preserves the preview evidence chain
    Given an applicable preview plan
    When the plan is applied
    Then its parent, plan hash, and document hash are submitted unchanged

  Scenario: Stale preview evidence is discarded
    Given the server rejects a preview because its source changed
    When apply reports the recoverable conflict
    Then the stale plan is cleared so a new preview can be requested

  Scenario: Cancellation has no durable side effect
    Given a preview is visible
    When the user cancels it
    Then local preview state is cleared and no creation command is dispatched
