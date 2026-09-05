Feature: Generic feature state-folder transition
  Start implementation moves a ready work item into progress and can reverse that move before implementation begins.

  Scenario: A ready feature starts implementation
    Given a feature folder is in the Ready To Develop state directory
    When the start transition moves it to In Progress
    Then the complete feature folder is moved to the In Progress state directory

  Scenario: Start fails before the implementation loop begins
    Given a feature folder was moved to In Progress by the current start transition
    When pre-implementation work fails
    Then the complete feature folder can be moved back to Ready To Develop

  Scenario: A transition target already exists
    Given the destination state directory already contains the same feature folder
    When a filesystem lifecycle transition is attempted
    Then the transition is rejected without overwriting either folder
