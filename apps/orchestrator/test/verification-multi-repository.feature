Feature: Verification follows configured source ownership across repositories
  A command working directory does not define the location of all its tests.
  Configuration references bind source scope without changing execution authority.

  Scenario: A frontend wrapper executes backend-owned tests without plan correction
    Given an inspected package script delegates to a runner in another Git repository
    And the plan references that runner and its actual test sources relative to cwd
    When HEPHA admits the inspection plan
    Then no correction worker is needed
    And the original command executes a non-zero passing test through the wrapper

  Scenario: Linked source changes invalidate a cached plan
    Given no selected command launches from the repository owning the delegated tests
    When that repository gains or changes source after the inspection baseline
    Then HEPHA requires reinspection instead of reusing the old baseline

  Scenario: Cross-repository scope is bounded
    Given a check binds its local configuration and a delegated runner repository
    When its test selection points outside those repositories or escapes through a symlink
    Then HEPHA rejects the selection before execution

  Scenario: Shared source ownership does not establish duplicate execution
    Given a wrapper and a direct runner select overlapping canonical test sources
    And they use the same configured suite profile
    When HEPHA validates the plan
    Then it preserves the configured commands and their source references
    And actual selection equivalence remains an inspection responsibility

  Scenario: A configured source directory remains a valid selection
    Given the configured test selection names a directory rather than a file glob
    When HEPHA enumerates it
    Then it includes tracked and nonignored sources without build artifacts
    And permits a focused command to reference the same files
