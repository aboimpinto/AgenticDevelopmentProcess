Feature: Generic phase completion evidence
  Phase progression depends on durable declared evidence rather than an agent completion claim.

  Scenario: A completed phase has resolved all declared checklist items
    Given a phase document is present and its lifecycle status is completed
    When every declared checklist item is resolved
    Then the phase has completion evidence

  Scenario: A phase still has unresolved declared work
    Given a phase is incomplete, blocked, missing its document, or has an unchecked item
    When completion evidence is evaluated
    Then progression is denied with a specific evidence summary

  Scenario: Human-review findings require task and response evidence
    Given a human-review phase contains one or more finding sections
    When its completion evidence is evaluated
    Then every finding has a resolved task checklist and an agent response or completed status
