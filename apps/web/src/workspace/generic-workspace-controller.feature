Feature: Generic workspace controller
  Project, work-item, document, and MemoryBank state share one production owner.

  Scenario: Project loading reconciles the current selection
    Given the project registry returns its current projects
    When workspace loading completes
    Then a valid selection is preserved or the first available project is selected

  Scenario: Work-item loading reconciles related read models
    Given a project is selected
    When its work-item scan is loaded
    Then items, source issues, scan evidence, and surviving selections are updated together

  Scenario: Project commands reconcile server-authored aggregates
    Given project creation or MemoryBank initialization is requested
    When the command succeeds
    Then project and work-item state is replaced from the returned evidence

  Scenario: MemoryBank and document changes refresh bounded state
    Given an initialized selected project and selected work item
    When MemoryBank or document refresh events occur
    Then current read models are reloaded and event resources are cleaned up
