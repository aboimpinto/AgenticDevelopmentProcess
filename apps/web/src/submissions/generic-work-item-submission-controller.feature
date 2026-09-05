Feature: Generic work-item submission controllers
  Submission forms bind user intent to the current project and reconcile server-authored state.

  Scenario: A parent work item is submitted from controlled form state
    Given a current project and edited parent form
    When the form is submitted
    Then the command contains the form and current project identity

  Scenario: A child work item is submitted from controlled form state
    Given a current project and edited child form
    When the form is submitted
    Then returned project, items, and selection replace the visible state

  Scenario: Parent refinement preserves work-item identity
    Given an existing parent work item and a refinement request
    When refinement is submitted
    Then the command preserves project, work-item, and request identity

  Scenario: Submission lifecycle remains recoverable
    Given a submission command fails or has no current project
    When the controller completes the attempt
    Then the error is reported, pending state is cleared, and no local outcome is invented
