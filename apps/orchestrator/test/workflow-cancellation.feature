Feature: Cooperative workflow cancellation
  An autonomous workflow remains responsive to its control plane even while it
  is selecting and retrying tasks inside the same phase.

  Scenario: Cancel a workflow with no attached worker process
    Given an autonomous workflow is running in the orchestrator process
    And no child worker process is currently attached
    When cancellation is requested
    Then the next autonomous decision throws a cancellation signal
    And the workflow does not record later running or failed progress

  Scenario: A same-phase retry loop yields to the control plane
    Given a workflow repeatedly selects work in the same phase
    When the orchestrator reaches the next selection boundary
    Then it yields to HTTP reads and cancellation
    And cancellation stops the loop before another task is dispatched
