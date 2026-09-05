Feature: Generic complete review-finding contract
  A reviewer specifies the entire bounded acceptance contract before a fixer is dispatched.

  Scenario: An actionable finding changes a field contract
    Given an arbitrary production field is in the current phase scope
    When the reviewer raises a required finding
    Then absent, null, type, format, bounds, caller migration, and forbidden fallback rules are stated
    And negative regressions and a valid positive control are measurable

  Scenario: A finding covers a cross-field matrix
    Given an arbitrary production rule varies by state or discriminator
    When the reviewer records the finding
    Then every value or case has required and forbidden fields
    And the fixer does not infer missing matrix rows from planning prose

  Scenario: A rerun discovers an omitted baseline condition
    Given an arbitrary finding already has a recorded acceptance contract
    When the reviewer evaluates the fix
    Then the omitted condition cannot be added to that finding
    And genuine planning ambiguity is blocked for user authority
