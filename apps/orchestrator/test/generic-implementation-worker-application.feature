Feature: Generic implementation worker lifecycle
  Every implementation worker has one validated and durable execution lifecycle.

  Scenario: A worker completes
    Given an arbitrary worker and model are selected
    When its skill contract is valid and Pi completes
    Then running and completed agent states surround ordered attempt audit events

  Scenario: A declared skill contract blocks launch
    Given an arbitrary worker declares a missing or invalid skill
    When pre-launch validation runs
    Then a failed agent state is recorded without launching Pi

  Scenario: A worker is cancelled
    Given an arbitrary Pi attempt is running
    When cooperative cancellation interrupts it
    Then the attempt is audited as cancelled
    And cancellation is rethrown without an ordinary failed agent state
