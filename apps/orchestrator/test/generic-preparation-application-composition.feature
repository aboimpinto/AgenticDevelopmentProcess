Feature: Generic work-item preparation application composition
  Submission, discovery, refinement, and deep-dive preparation share explicit application graphs.

  Scenario: An EPIC is authored and missing features are discovered
    Given an EPIC requires additional feature planning
    When the authoring workflow scans its current work items
    Then the configured planning model performs discovery
    And submitted feature documents use the shared identifier allocator

  Scenario: A work item enters an interactive deep dive
    Given a work item needs clarification before refinement
    When the deep-dive workflow starts a session
    Then project lessons inform its questions
    And answers remain attached to the durable session

  Scenario: An interrupted deep dive resumes
    Given a workflow requires clarification after an interrupted transition
    When continuation recovery creates a deep-dive session
    Then source hashes preserve the recovery context
    And completion can synchronize the linked EPIC
