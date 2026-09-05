Feature: Generic feature workflow context collection
  Workflow agents receive bounded, role-aware documents without broadening execution or review scope.

  Scenario: A normal workflow needs implementation context
    Given feature, linked-parent, project, planning, and lesson documents exist
    When default workflow context is collected
    Then the bounded documents and complete linked acceptance scenarios are included

  Scenario: A code review needs narrow context
    Given a current phase and its production change attribution exist
    When code-review context is collected
    Then only current phase state, production targets, task ledger, lessons, and recovery context are included

  Scenario: Optional context is unavailable
    Given an optional context folder or document does not exist
    When workflow context is collected
    Then an explanatory empty section is returned without failing the workflow
