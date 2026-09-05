Feature: Generic dashboard live activity

  Scenario: File changes are coalesced before refresh
    Given repeated file changes arrive for the selected project
    When the debounce interval completes
    Then the project work items are refreshed once

  Scenario: Phase changes refresh selected detail
    Given a phase event targets the selected work item
    When the event is handled
    Then document detail and project work items are refreshed

  Scenario: Attention events remain visible temporarily
    Given a workflow event requires attention
    When the event is handled
    Then its summary is announced and later cleared

  Scenario: Refresh failures use the caller error boundary
    Given a live event requires a project refresh
    When that refresh fails
    Then the caller receives a safe error message
