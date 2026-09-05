Feature: Generic phase worker prompt policies

  Scenario: A phase worker receives common execution safeguards
    Given a phase with any number and title
    When Hepha composes its implementation or review prompt
    Then shell, build, validation, evidence, and learned-rule safeguards are available

  Scenario: A phase worker receives durable ledger ownership rules
    Given a phase whose tasks or review findings are resumed
    When Hepha composes the next worker prompt
    Then Hepha remains the owner of machine task and finding state
