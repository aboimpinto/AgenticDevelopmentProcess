Feature: Terminal work items are read-only
  Completed and cancelled work items must not re-enter preparation workflows.

  Scenario: A completed feature becomes stale after final documentation changes
    Given a feature is in the completed lifecycle state
    And its saved Deep-Dive source hash is stale
    When workflow actions are projected
    Then no Deep-Dive, preparation, implementation, or completion action is available
    And a direct Deep-Dive request is refused

  Scenario: A cancelled feature retains stale preparation metadata
    Given a feature is in the cancelled lifecycle state
    When workflow actions are projected
    Then no Deep-Dive or preparation action is available
    And a direct Deep-Dive request is refused

  Scenario: An active feature requires a new Deep-Dive
    Given a feature is in a non-terminal lifecycle state
    When a Deep-Dive request is evaluated
    Then the lifecycle policy permits the request

  Scenario: A completed epic is terminal
    Given an epic is completed
    When a Deep-Dive request is evaluated
    Then the request is refused
