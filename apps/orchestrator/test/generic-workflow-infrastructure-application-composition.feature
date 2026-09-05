Feature: Generic workflow infrastructure application composition
  Durable workflow repositories, metadata, and live change delivery share one process foundation.

  Scenario: Workflow infrastructure starts
    Given runtime paths and environment are configured
    When the infrastructure applications are composed
    Then durable metadata is opened through the host lifecycle boundary
    And repositories remain inactive until an application calls them

  Scenario: Workflow evidence is summarized
    Given a workflow failure or review report exists
    When an application requests its durable context
    Then specialized repositories and presenters retain evidence authority
    And summaries do not create workflow state

  Scenario: Project state changes
    Given a project application emits a change
    When the shared notifier receives the event
    Then live activity and MemoryBank event streams receive the same identity
    And route handlers retain ownership of client delivery
