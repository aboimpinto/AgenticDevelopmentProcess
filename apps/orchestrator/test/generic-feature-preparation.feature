Feature: Generic feature preparation
  Preparation commands classify current source and dispatch only eligible work.

  Scenario: Refinement records its durable run before worker dispatch
    Given a generic submitted work item is eligible for refinement
    When the production preparation application starts refinement
    Then the running workflow is persisted before one refinement worker is dispatched
    And observers receive one workflow-started event
