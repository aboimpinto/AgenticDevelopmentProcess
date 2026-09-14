Feature: One validated plan handoff reaches the shared execution and evidence pipeline
  Scenario: A configuration error does not create unrelated phase repairs
    Given a check has a wrong configuration path and phases reference that declared check
    When HEPHA validates the plan
    Then it identifies the original field, cwd and resolved path
    And preserves phase mappings without requiring a different check order
    When the worker returns a small update for the diagnosed check
    Then HEPHA merges it and validates the complete plan
    And unrelated updates cannot change the scope

  Scenario: Inspection and correction share a valid JSON template
    Given the required phase numbers for a feature
    When inspection or correction is prompted
    Then both receive the same syntactically valid JSON template
    And unchanged example placeholders cannot pass execution admission

  Scenario Outline: Presentation wrappers do not block actual verification
    Given a valid feature-scoped plan returned as <format>
    When the user refreshes completion readiness
    Then no formatting correction worker is dispatched
    And relevant test processes execute against current source
    And their reports enter the same evidence importer used by phase verification
    Examples:
      | format                     |
      | plain JSON                 |
      | fenced JSON                |
      | explanation and fenced JSON |
      | explanation and JSON       |
      | explanation with inline code |

  Scenario: Malformed JSON has a recovery path
    Given a worker returns a plan missing its closing delimiter
    When HEPHA diagnoses the syntax category and line and column
    Then the correction worker receives the saved response and specific recovery guidance
    And a corrected valid plan proceeds to actual tests and evidence import

  Scenario: A substantive error receives targeted correction
    Given a plan misclassifies a runtime preflight as a test
    When its canonical candidate and exact validation errors are corrected
    Then the correction has a three-minute runtime bound
    And an explanation around the corrected JSON does not cause another correction
    And relevant tests execute before reports are assessed

  Scenario Outline: Unresolved handoffs cannot authorize tests
    Given the inspection and correction workers return <invalid output>
    When the user refreshes completion readiness
    Then repeated unchanged diagnostics trigger diagnosis and bounded escalation
    And no tests execute and no evidence is certified
    Examples:
      | invalid output     |
      | ambiguous plans    |
      | truncated plan     |
      | malformed envelope |
      | extra closing brace |
      | truncated containing array |
      | inline competing plan |
