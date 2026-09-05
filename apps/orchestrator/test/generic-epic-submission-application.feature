Feature: Generic EPIC submission application boundary
  The orchestrator delegates initiative authoring without depending on one concrete work-item identity.

  Scenario: Structured scope is finalized before persistence
    Given a project and structured initiative scope
    When the initiative is submitted
    Then the canonical finalizer processes the scope before a document is written

  Scenario: A raw idea is expanded before finalization
    Given a project and a non-empty raw initiative idea
    When the initiative is submitted in idea mode
    Then the idea author runs before the canonical finalizer

  Scenario: Missing idea text is rejected
    Given a project and blank raw initiative text
    When the initiative draft is resolved
    Then no authoring prompt is started

  Scenario: An allocated identity collision is denied
    Given the allocated initiative folder already exists
    When the initiative is submitted
    Then the existing document is not overwritten

  Scenario: A created initiative is reloaded and announced
    Given the finalized initiative document is written
    When the project is scanned again
    Then the created initiative and project change notification are returned
