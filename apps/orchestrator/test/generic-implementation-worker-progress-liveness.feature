Feature: Generic implementation worker progress liveness

  Scenario: Productive implementation exceeds the former total-duration boundary
    Given an implementation worker has no explicit wall-clock maximum
    When observable Pi or tool output changes before each configured stall interval expires
    Then each activity event resets the stall circuit
    And the productive worker may continue until it completes

  Scenario: Silent implementation stops at the configured stall boundary
    Given an implementation worker is still alive
    When no observable Pi or tool output changes during the configured stall interval
    Then Hepha terminates the worker once
    And reports the no-progress stall as the primary cause

  Scenario: An operator can retain an explicit absolute safety cap
    Given an operator configures an implementation maximum runtime
    When the worker reaches that maximum despite continuing activity
    Then Hepha terminates the worker at the explicit maximum
    And does not describe the stop as an inactivity stall
