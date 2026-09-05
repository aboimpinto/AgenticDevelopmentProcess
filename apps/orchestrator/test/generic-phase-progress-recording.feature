Feature: Generic phase progress recording
  Every phase transition has one ordered operational evidence path.

  Scenario: An active workflow publishes phase progress
    Given an arbitrary phase transition is ready to persist
    When the run is still active
    Then an append-only audit event is emitted
    And the phase run is persisted before workflow progress is projected

  Scenario: The workflow was cancelled
    Given an arbitrary phase transition is ready to persist
    When cancellation denies the run
    Then no phase audit is emitted
    And no phase or workflow progress is persisted
