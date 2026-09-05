Feature: Generic refactor ledger integrity
  A long-running modularization remains auditable as responsibilities move between files.

  Scenario: Slice numbers form one continuous history
    Given the refactor history spans multiple ledger documents
    When the architecture quality gate reads every numbered slice
    Then no slice number is missing or duplicated

  Scenario: Every slice states one responsibility
    Given a refactor slice changes production ownership
    When the architecture quality gate inspects its declaration
    Then the slice has a non-empty responsibility statement

  Scenario: Every slice records the required engineering evidence
    Given a refactor slice is recorded as complete
    When the architecture quality gate inspects its evidence table
    Then production callers, unit tests, Gherkin, integration, side effects, compatibility, and resulting sizes are present
