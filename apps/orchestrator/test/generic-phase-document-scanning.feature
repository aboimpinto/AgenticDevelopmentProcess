Feature: Generic phase document scanning
  Phase order comes from the numeric prefix while every phase name remains arbitrary.

  Scenario: Arbitrarily named phase files are scanned in declared numeric order
    Given a feature folder contains phase Markdown with unrelated names
    When the production phase scanner reads the folder
    Then phases are ordered by their numeric prefix
    And routing, timing, status, and title are projected from each document
