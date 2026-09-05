Feature: Generic work-item parent relationship controller
  Link, relink, and unlink commands preserve identity and server authority.

  Scenario: Relationship commands use durable external identity
    Given a current project and child work item
    When a parent relationship command is submitted
    Then the project and child identities are encoded in the command path

  Scenario: Returned items are refreshed after every accepted command
    Given the relationship command returns an outcome
    When reconciliation completes
    Then current work items are fetched and replace the visible list

  Scenario: Blockers remain distinct from successful warnings
    Given the server reports blockers or non-blocking warnings
    When the response is interpreted
    Then blockers prevent a success result and warnings accompany the success notice

  Scenario: Transport failure remains recoverable
    Given a relationship command cannot be transported
    When the attempt finishes
    Then the error is visible and linking state is cleared
