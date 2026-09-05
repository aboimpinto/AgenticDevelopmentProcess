Feature: Generic extracted root helper policies

  Scenario: Project changes reach both event streams
    Given a project lifecycle event is published
    When the project change notifier handles the event
    Then MemoryBank subscribers receive it
    And live activity subscribers receive it

  Scenario: Contained project paths are portable
    Given an artifact is inside the project root
    When its relative path is projected
    Then the result uses portable forward slashes

  Scenario: External paths retain their absolute identity
    Given an artifact is outside the project root
    When its relative path is projected
    Then the original path is returned

  Scenario: Pi session filename components are safe and bounded
    Given an agent role contains spaces and punctuation
    When its session filename component is created
    Then punctuation is replaced with separators
    And the component does not exceed the declared length limit
