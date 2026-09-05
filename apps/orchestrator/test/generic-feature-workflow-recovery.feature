Feature: Generic feature workflow recovery projection
  Historical workflow failures yield to current durable state only when the completed operation can be proven.

  Scenario: Design or refinement output exists after the worker stopped
    Given a preparation workflow is recorded as failed
    And all operation-owned artifacts now exist
    When the current workflow summary is projected
    Then the historical failure is marked as superseded

  Scenario: Implementation state proves earlier work completed
    Given an implementation workflow is recorded as failed
    And all implementation phases are resolved
    When the current workflow summary is projected
    Then the historical implementation failure is marked as superseded

  Scenario: Feature completion itself failed
    Given the completion workflow is recorded as failed
    When the current workflow summary is projected
    Then the completion failure remains actionable

  Scenario: The stopped worker exceeded its time limit
    Given durable output proves the operation completed
    And the historical failure text describes a timeout
    When recovery is presented
    Then the outcome identifies a recovered timeout and the eligible next action
