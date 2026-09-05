Feature: Generic application-shell composition
  The application shell contains only production-reachable composition code.

  Scenario: Exported shell surfaces remain composition roots
    Given the dashboard has an application shell and public detail surfaces
    When production reachability is evaluated
    Then every local function is reachable from an exported composition root

  Scenario: Workflow interaction uses its bounded presentation
    Given a selected work item exposes workflow actions
    When the detail surface is composed
    Then the shell delegates workflow interaction to the bounded workflow panel

  Scenario: Work-item details use their bounded blade
    Given a work item is selected
    When the detail surface is composed
    Then the shell delegates document and panel presentation to the bounded detail blade

  Scenario: Replaced local remnants are absent
    Given bounded workflow and detail presentations are active
    When the shell source is inspected
    Then no superseded workflow console, history, evidence, phase, or validation component remains

  Scenario: Every web production module belongs to the live application graph
    Given the dashboard production source tree
    When module reachability is traced from the browser entry point
    Then every production module is reachable without relying on a test import
