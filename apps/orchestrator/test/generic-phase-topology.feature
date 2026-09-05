Feature: Generic refinement-defined phase topology
  The executor must order phases by their numeric prefix without prescribing
  a phase count, filename suffix, display title, or feature delivery shape.

  Scenario: Arbitrary phase names and counts are accepted
    Given a refinement contract declares any number of phase documents
    And every document path starts with its matching phase number
    When the generic phase contract is validated
    Then the arbitrary suffixes and titles are accepted

  Scenario: A phase document without the numeric prefix is rejected
    Given a refinement contract declares a Markdown document without phase-<number>
    When the generic phase contract is validated
    Then validation rejects the document before implementation

  Scenario: A heading number that differs from the filename is rejected
    Given a phase filename starts with one phase number
    And its Markdown heading starts with a different Phase number
    When the generic refinement artifacts are validated
    Then validation rejects the inconsistent phase identity
