Feature: Generic review artifact path policy
  Review artifacts have one project-relative content-addressed destination.

  Scenario: A valid artifact receives its canonical destination
    Given a project-relative feature root, supported artifact kind, and content hash
    When the artifact destination is derived
    Then it is nested under the feature review artifact directory

  Scenario: Absolute and URI-like paths are rejected
    Given a caller supplies an absolute, drive-qualified, or URI-style path
    When the path policy evaluates it
    Then deterministic invalid input is returned

  Scenario: Traversal and ambiguous segments are rejected
    Given a caller supplies traversal, dot, or empty path segments
    When the path policy evaluates it
    Then deterministic invalid input is returned

  Scenario: The caller cannot choose artifact kind or hash syntax
    Given a caller supplies an unsupported kind or malformed content hash
    When the artifact destination is derived
    Then deterministic invalid input is returned
