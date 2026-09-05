Feature: Generic Start Implementation run coordination
  Scenario: Implementation starts successfully
    Given an authorized implementation start
    When branch, transition, post-processing, and implementation complete
    Then completion is persisted and a successor may be scheduled

  Scenario: Only the lifecycle transition is requested
    Given an authorized transition-only start
    When branch and state transition complete
    Then transition completion is persisted without implementation

  Scenario: Work fails before implementation begins
    Given a work item moved to in-progress
    When pre-loop processing fails
    Then the state transition is rolled back and failure is recorded

  Scenario: Start execution is cancelled
    Given a running start receives cancellation
    When the coordinator handles it
    Then cancellation is published without recovery

  Scenario: Post-loop failure is recovered
    Given implementation began and then failed
    When automatic recovery succeeds
    Then the start run completes from recovered evidence

  Scenario: Post-loop failure cannot be recovered
    Given implementation began and then failed
    When automatic recovery cannot proceed
    Then the classified failure is persisted
