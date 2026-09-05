Feature: Generic workflow transition receipt policy
  Every lifecycle transition uses deterministic current context rather than command-specific guesses.

  Scenario: Current feature context is assembled
    Given a feature source document and refinement task plan
    When transition context is created
    Then their disk hashes and current workflow state are selected

  Scenario: A named context pack is selected
    Given the transition declares a context pack
    When transition context is created
    Then the pack reference is bound to selected file evidence

  Scenario: Receipt evidence is invalid
    Given selected transition context cannot be validated against the project
    When the transition receipt is checked
    Then an actionable transition error is returned
