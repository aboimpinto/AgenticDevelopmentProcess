Feature: Generated design document access
  Generated design documents remain separate from the primary work-item specification
  while staying directly accessible from the work-item detail surface.

  Scenario: Design documents are presented as explicit links
    Given a feature has a complete set of generated design documents
    When its detail surface is displayed
    Then each generated design document is available as a named link
    And no design document content is rendered inline

  Scenario: A selected design document opens in a full-screen reader
    Given the generated design document links are visible
    When the user selects one document
    Then that document is loaded through the project work-item boundary
    And its content is displayed in a full-screen dialog

  Scenario: A selected design document can be downloaded as PDF
    Given a generated design document is open
    When the user chooses Download PDF
    Then the download targets the PDF representation of that selected document

  Scenario: The full-screen reader can be dismissed without changing the source specification
    Given a generated design document is open
    When the user closes the reader
    Then the generated document is no longer displayed
    And the feature detail surface remains available
