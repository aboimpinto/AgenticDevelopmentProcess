Feature: Generic detail surface routing

  Scenario: A selected work item opens its detail surface
    Given a work item is selected
    When the detail surface is rendered
    Then the work item blade receives the selected item

  Scenario: A source issue opens its diagnostic surface
    Given a source issue is selected
    When the source issue surface is rendered
    Then the source issue blade receives the selected issue

  Scenario: Project context opens the project surface
    Given no item-specific surface is selected
    When the project surface is rendered
    Then the project blade receives the current project context

  Scenario: Work item panels remain composed by the detail router
    Given a feature work item is selected
    When the detail surface composes its supporting panels
    Then workflow, delivery, relationship, and linking panels are available
