Feature: Generic phase worker task settlement
  Worker output must settle only the active declared task before durable state is read again.

  Scenario: An ordinary task succeeds
    Given a phase worker has an active task
    When the worker returns successful output
    Then the task is completed and canonical phase state is refreshed

  Scenario: A declared task returns a blocker
    Given a declared task is selected in contract order
    When its transition is blocked
    Then the task is not marked complete

  Scenario: A fixer succeeds before independent review
    Given the active declared task is resolving review findings
    When the fixer returns successfully
    Then the task remains open for the independent reviewer transition
