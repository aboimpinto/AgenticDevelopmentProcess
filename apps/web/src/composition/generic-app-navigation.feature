Feature: Generic application navigation
  Navigation transitions keep one coherent detail, board, and overlay surface.

  Scenario: Selecting an item opens its detail surface
    Given a board item is available
    When the user selects the item
    Then stale document state is cleared and the item detail surface opens

  Scenario: Selecting a project resets project-bound surfaces
    Given another project is selected
    When the project transition is applied
    Then item selection, source selection, notices, and dependent sessions are reset

  Scenario: Opening a submission keeps surfaces mutually exclusive
    Given a submission action is available
    When the submission surface opens
    Then the detail surface closes before the submission opens

  Scenario: Escape respects a higher-priority interaction
    Given the detail surface is open
    When Escape is pressed during or outside a higher-priority interaction
    Then the detail closes only when no higher-priority interaction owns Escape
