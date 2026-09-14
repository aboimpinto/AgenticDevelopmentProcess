Feature: Human-directed feature exploration
  Scenario: Revisit a clarified feature
    Given an idle non-terminal feature with no validation markers and a completed interview
    When the human starts another Deep-Dive with optional focus text
    Then a new interview preserves the focus separately from the source specification
    And opening and follow-up questions explicitly explore that focus
    And only answered decisions may change the specification

  Scenario: Resume without losing an existing interview
    Given an open interview with saved focus and answers
    When the human resumes without changing focus
    Then the existing interview and its focus are returned
    And different focus is not silently discarded or substituted

  Scenario: Protect active implementation
    Given another workflow is running for the feature
    When the human attempts to start Deep-Dive
    Then the backend refuses without replacing the active workflow

  Scenario: Require design independently of the execution provider
    Given a feature has unknown UI classification or required design is missing
    When native or compatibility refinement is requested
    Then refinement is refused until the design prerequisite is satisfied
    And an idle feature still offers voluntary Deep-Dive

  Scenario: Reevaluate classification after a source revision
    Given UI classification was attempted for the previous feature specification
    When the specification changes
    Then automatic classification can be attempted for the new revision
    And invalid classifier output never becomes a no-UI decision
