Feature: Generic application shell composition
  The shell view presents one route and the interaction surfaces selected by its controllers.

  Scenario: A primary route owns the main content
    Given a primary navigation destination
    When the shell view is composed
    Then the matching route surface is rendered

  Scenario: Detail and modal surfaces follow controller state
    Given controller state requests a detail or modal surface
    When the shell view is composed
    Then only the requested surfaces are added to the shared shell

  Scenario: Workspace status is presented consistently
    Given workspace error, notice, or initialization state
    When a board route is rendered
    Then the corresponding status banner is visible

  Scenario: Shared chrome remains independent of the route
    Given any primary navigation destination
    When the shell view is composed
    Then the sidebar and top bar remain present
