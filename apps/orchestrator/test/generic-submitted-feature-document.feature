Feature: Generic submitted-feature document creation
  Approved EPIC extraction creates missing submitted feature documents without overwriting existing work.

  Scenario: An EPIC explicitly references a missing feature
    Given an approved EPIC document contains an identifiable child feature reference
    When the submitted feature document is created
    Then its title is recovered and the document is marked for later validation

  Scenario: An approved plan describes a missing feature
    Given an approved extraction candidate contains scope and acceptance criteria
    When the submitted feature document is created
    Then the canonical planned-feature template records the approved content

  Scenario: The target submitted feature already exists
    Given a submitted feature folder already occupies the derived target path
    When document creation is attempted again
    Then no file is overwritten and the writer reports that nothing was created
