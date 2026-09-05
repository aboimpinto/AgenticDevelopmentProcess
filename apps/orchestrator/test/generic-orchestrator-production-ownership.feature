Feature: Generic orchestrator production ownership
  The composition root must retain only behavior reached by production workflows.

  Scenario: A composition-root helper has a production caller
    Given a helper is declared in the composition root
    When production source ownership is audited
    Then at least one production call or binding references that helper

  Scenario: A test-only helper does not justify production code
    Given a helper is referenced only by tests
    When production source ownership is audited
    Then the helper is not retained in the composition root

  Scenario: Extracted behavior remains wired into production
    Given a responsibility is moved to its owning module
    When the composition root is inspected
    Then production composition references the extracted owner
