Feature: Generic autonomous implementation workflow sequencing

  Scenario: A completed queue returns without dispatching another worker
    Given every declared phase is resolved
    When autonomous implementation is requested
    Then the workflow reports that implementation is already complete

  Scenario: A legacy gate recovery uses the dedicated recovery path
    Given the queue identifies missing legacy quality evidence
    When autonomous implementation is requested
    Then the direct recovery application receives the queued phase

  Scenario: Human findings are handled before implementation phases
    Given the queue identifies an unresolved human review item
    When autonomous implementation is requested
    Then the human review application handles that queue entry

  Scenario: Phase entries execute in durable queue order
    Given the queue contains unresolved phase documents
    When autonomous implementation iterates the queue
    Then each iteration yields control and verifies the implementation branch
    And dedicated phase applications decide entry, work, review, and exit

  Scenario: Reconciled task completion still crosses the phase exit boundary
    Given the final declared task reconciles the phase document as completed
    When the autonomous coordinator receives the advance-phase continuation
    Then phase exit authorization and any declared git checkpoint run before next-phase selection

  Scenario: Host routing without durable progress pauses for the user
    Given a phase route returns to the same transition and decision after one recovery cycle
    And FEAT, task, review, and checkpoint evidence remains unchanged
    When Hepha compares the before-and-after durable fingerprints
    Then the workflow becomes blocked with the route, durable fingerprint, and recovery justification
    And the user may choose Continue Implementation or Cancel without losing completed task evidence

  Scenario: A phase error is recorded without replacing the original failure
    Given a dedicated phase application fails
    When the failure is not a workflow cancellation
    Then the failure recorder receives the active phase and task context
    And the original failure is returned to the caller

  Scenario: Workflow cancellation bypasses phase failure recording
    Given phase execution observes a workflow cancellation
    When the autonomous coordinator handles the cancellation
    Then the cancellation is returned without publishing a phase failure
