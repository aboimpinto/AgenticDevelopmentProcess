Feature: Phase gate applicability survives compatibility recipe projection
  Scenario: Documentation output does not manufacture code verification obligations
    Given a completed documentation phase declares tests and code review not applicable with reasons
    And it mentions an unrelated source file preserved untouched
    When HEPHA scans the feature and calculates completion blockers
    Then the documentation phase contributes no code verification gaps
    And its applicability reasons remain available on its phase card

  Scenario: Declared applicability is independent of source-file presence
    Given a completed phase named Planning declares code gates not applicable
    But its changed-file evidence records production code
    When HEPHA scans the feature and calculates completion blockers
    Then both declared non-applicable gates remain settled
    And source-file presence does not invent a verification obligation

  Scenario Outline: Missing declarations cannot be inferred from changed-file inventory
    Given a legacy phase has no explicit test or review declaration
    And its only changed file is "<file>"
    When HEPHA scans its phase gates
    Then test and review declarations require reconciliation
    And the file list does not certify a passing execution
    Examples:
      | file                   |
      | docs/plan.md           |
      | packages/service.ts    |
      | tests/service.test.ts  |
      | apps/web/view.tsx      |

  Scenario: Supporting health checks do not replace or invalidate behavioral coverage
    Given an acceptance criterion maps to a passing behavioral test and passing lint check
    When HEPHA evaluates the explicit phase gates
    Then its acceptance coverage is satisfied
    But lint alone cannot prove behavioral coverage
    And a failed lint check remains a non-blocking warning

  Scenario: Explicit boolean declarations survive repair evidence and advisory health findings
    Given a completed phase declares coverage and code review false with a scope justification
    And old verification prose still says tests are required
    And its build result is unknown and its lint check failed
    When HEPHA rescans the repaired phase and counts blocking quality gates
    Then the test and review applicability stays not applicable
    And both health diagnostics remain visible as optional repair warnings
    And no health finding is relabelled as missing test coverage

  Scenario: Required review flags defer to the persisted review verdict
    Given a phase explicitly requires code review and has a persisted review report
    When HEPHA scans the declaration and the report together
    Then an approved report satisfies the required review
    But a report requesting changes keeps the required review blocking
    And a required declaration never shadows the report with a missing placeholder
