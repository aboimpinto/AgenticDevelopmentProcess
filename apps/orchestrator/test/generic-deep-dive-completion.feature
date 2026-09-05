Feature: Generic Deep-Dive completion
  Answered decisions update their linked source and create durable evidence
  before a Deep-Dive workflow is declared complete.

  Scenario: Completion requires all decisions and a writable source
    Given a Deep-Dive session contains unresolved questions or no linked document
    When completion is requested
    Then no document-update workflow node is run

  Scenario: A feature Deep-Dive completes after durable evidence
    Given every question is answered and the source is writable
    When the updated source is stored
    Then semantic and hash evidence is recorded before workflow completion
    And observers are notified only after completion is durable

  Scenario: An aggregate work item synchronizes before final evidence
    Given a Deep-Dive changes an aggregate source document
    When completion runs
    Then linked work-item state is synchronized before final evidence is captured

  Scenario: Document update failure remains recoverable
    Given source-document update fails
    When completion handles the failure
    Then the session and workflow are marked failed when storage is available
    And the original failure is rethrown after observers are notified

  Scenario: Answer readiness is recorded through the declared workflow
    Given all session questions become answered
    When the project still exists
    Then the answers-ready workflow node is recorded exactly once
