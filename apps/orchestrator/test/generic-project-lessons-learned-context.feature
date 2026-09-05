Feature: Generic project LessonsLearned context selection
  Workflow agents receive focused project rules without coupling the selection to a work-item identity.

  Scenario: Active rules are selected before historical lesson documents
    Given a project contains active rules and historical lesson documents
    When workflow context is prepared for an agent role and current work
    Then focused active rules appear before bounded historical source context

  Scenario: An active index is not treated as an executable rule document
    Given the active lesson directory contains an index and executable rule documents
    When active documents are scored for the current focus
    Then the index is excluded and common project rules remain eligible

  Scenario: Lesson discovery stays inside the configured project directories
    Given lesson files and unrelated files have similar names
    When the context reader discovers and classifies lesson documents
    Then only Markdown within the LessonsLearned boundary is rendered
