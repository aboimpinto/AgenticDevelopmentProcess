Feature: Generic workflow cancellation
  A cancellation interrupts local execution before recording durable terminal state.

  Scenario: Cancelling active work preserves work that never started
    Given a generic workflow has one running step, one pending step, and one completed step
    When the production cancellation application cancels the workflow
    Then local execution is interrupted before cancellation is persisted
    And the running step is failed as interrupted
    And the pending and completed steps retain their existing states
