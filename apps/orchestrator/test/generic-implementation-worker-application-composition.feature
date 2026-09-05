Feature: Generic implementation worker application composition
  Start post-processing, interactive handoff, direct recovery, and autonomous phase work share one worker graph.

  Scenario: Start Feature prepares implementation context
    Given a feature has entered its implementation branch
    When start post-processing runs
    Then historical estimation calibration informs the prompt
    And declared timing is authorized before phase execution

  Scenario: Interactive implementation is selected
    Given autonomous execution is disabled
    When an implementation command is handed to a worker
    Then the configured implementation model receives current context
    And durable workflow progress records the handoff

  Scenario: Autonomous implementation is selected
    Given a feature has sequential phase tasks
    When the autonomous phase loop executes
    Then specialized phase applications retain transition authority
    And direct recovery uses the same target and worker boundaries
