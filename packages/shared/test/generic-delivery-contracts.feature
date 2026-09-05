Feature: Generic implementation delivery contracts
  Implementation work must retain branch and delivery evidence across workflow boundaries.

  Scenario: Record branch preparation
    Given an implementation branch is required
    When branch preparation completes
    Then the selected repository, base, branch, and start commit are recorded

  Scenario: Resume a partially completed start transition
    Given a start transition stopped after branch preparation
    When implementation resumes
    Then the last transition step and recovery status identify where to continue

  Scenario: Present delivery readiness
    Given delivery configuration was parsed from a work item
    When delivery status is presented
    Then the read model explains whether remote delivery can be prepared
