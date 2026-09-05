Feature: Generic EPIC refinement application
  An operator-requested refinement updates one existing EPIC while preserving identity and durable history.

  Scenario: The refinement request is blank
    Given an existing EPIC is selected
    When an empty refinement request is submitted
    Then model work and document mutation are rejected

  Scenario: The source document is unavailable
    Given the selected EPIC has no readable description document
    When refinement is submitted
    Then the request is rejected before model work

  Scenario: The model loses EPIC identity
    Given the model returns updated Markdown without the original external identity
    When the refinement result is validated
    Then the original document is not replaced

  Scenario: A valid refinement is applied
    Given the model preserves identity and returns a valid refinement
    When the refinement is submitted
    Then the document and append-only refinement history are updated
    And the EPIC is reloaded and observers are notified
