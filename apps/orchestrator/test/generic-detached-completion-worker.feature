Feature: Generic detached completion worker lifecycle
  A detached completion worker remains running until its independent workflow observes terminal evidence.

  Scenario: Detached Pi launches
    Given an arbitrary completion worker is ready
    When detached Pi returns a process identity
    Then the agent run remains running
    And the launch summary records that process identity

  Scenario: Detached Pi cannot launch
    Given an arbitrary completion worker is ready
    When process launch fails
    Then a failed launch state is recorded best effort
    And the attributed launch error is returned
